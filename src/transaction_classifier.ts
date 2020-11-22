import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin';
import * as tf from '@tensorflow/tfjs'
import * as use from '@tensorflow-models/universal-sentence-encoder'
import * as label_set from '../model/label_map.json'
import { transaction_aggregator } from './transaction_aggregator'

//Init models
let use_model: use.UniversalSentenceEncoder, model: tf.LayersModel

export async function predict(narration: string) {
    const processed_narration = narration.toLowerCase().replace(/[\/\:]|\d+/g, ' ').replace(/\s+/g, ' ').trim();
    model = model || await tf.loadLayersModel('file://./model/model.json')
    use_model = use_model || await use.load()

    // @ts-ignore
    return label_set[tf.argMax(model.predict(await use_model.embed(processed_narration)), 1).dataSync()[0]]
}

export const transaction_classifier = functions.runWith({ memory: '1GB' })
    .firestore
    .document('/users/{user}/transactions/{transaction}')
    .onCreate(async (snap, context) => {
        require('@tensorflow/tfjs-node');
        const vendor = await predict(snap.data().narration)
            .catch(e => admin.firestore().collection('prediction_errors')
                .add({ narration: snap.data().narration, timestamp: context.timestamp, error: e.toString() })
                .then(ref => 'Undefined')
            )
        await snap.ref.update({ vendor })

        //Run Aggregations
        await transaction_aggregator(snap, context, vendor);
    });