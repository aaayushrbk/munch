import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin';
import { transaction_aggregator } from './transaction_aggregator'
import {predict} from './transaction_classifier'
//Init models

export let transaction_classifierUpdate = functions.runWith({ memory: '1GB' })
    .firestore
    .document('/users/{user}/transactions/{transaction}')
    .onUpdate(async (change, context) => {
        require('@tensorflow/tfjs-node');



        const after = change.after.data()
        const before = change.before.data()
        let vendor
        if(before === after) {console.log('Nothing to do! ') ; return null;}
        else { // changes in narration for testing purposes
        //console.log('narration update :: ' , after.narration)
         vendor = await predict(after.narration)
            .catch(e => admin.firestore().collection('prediction_errors')
                .add({ narration: after.narration, timestamp: context.timestamp, error: e.toString() })
                .then(ref => 'Undefined')
            )
        //console.log('vendor update::: ', vendor)
        const updated = await change.after.ref.update({ vendor })
        
        //Run Aggregations
        await transaction_aggregator(change.after, context, vendor);

        return updated
        }
    });