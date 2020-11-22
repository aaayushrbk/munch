import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';
import axios from 'axios';
import * as moment from 'moment';
import * as uuid from 'uuid';
const atob = require('atob');
import * as xml2js from 'xml2js';
import * as bodyParser from 'body-parser';

import * as onemoney_config from './onemoney_config.json';
//process.env.FIRESTORE_EMULATOR_HOST = 'localhost:4000';
//admin.initializeApp({projectId: "munch-hackathon"});
admin.initializeApp()

const app = express()
// tslint:disable-next-line: deprecation
app.use(bodyParser.json())
app.get('/', (req, res) => res.send('OK!'))

const session_map: Map<String, Object> = new Map();

app.get('/onboard', async (req, res) => {
    //Create session
    const sessionId = await axios.post('https://api-sandbox.onemoney.in/user/initsession', {
        vua: req.query.id
    }, {
        headers: {
            ...onemoney_config,
            'Content-Type': 'application/json'
        }
    }).then(data => data.data.sessionId)

    if (sessionId) {//Get profile data
        res.send(await axios.get('https://api-sandbox.onemoney.in/user/user-profile?identifierRequired=true', {
            headers: {
                sessionId,
                'Content-Type': 'application/json'
            }
        }).then(data => data.data))
    }
    else res.send(500)
})

app.post('/Consent/Notification', async (req, res) => {
    const consentId = req.body.ConsentStatusNotification.consentId;

    //Create temp key-pair
    const { publicKey, privateKey } = await axios.get('https://forwardsec-test-dwa5vy2nxq-ue.a.run.app/ecc/v1/generateKey')
        .then(r => r.data)
        .catch(e => console.log('keygen:', e))

    // console.log(req.body)

    //Request FI data
    const { sessionId } = await axios.post('https://api-sandbox.onemoney.in/aa/FI/request', {
        ver: '1.1.3',
        timestamp: moment().toISOString(),
        "txnid": uuid.v4(),
        "FIDataRange": {
            "from": moment().subtract(2, 'years').toISOString(),
            "to": moment().toISOString()
        },
        "Consent": {
            "id": consentId,
            "digitalSignature": "NA"
        },
        "KeyMaterial": {
            "cryptoAlg": "ECDH", "curve": "Curve25519", "params": "string",
            "DHPublicKey": {
                "expiry": moment().add(1, 'hour').toISOString(),
                "Parameters": "string",
                "KeyValue": publicKey
            }, "Nonce": "bURnRGpuOEdHc1VxZFdVN1NldTVna0E4YkM3a0ZVNW5="
        }
    }, { headers: { 'Content-Type': 'application/json', 'client_api_key': onemoney_config.client_api_key } })
        .then(r => r.data)
        .catch(e => console.log('FI request:', e))

    session_map.set(sessionId, privateKey)
    res.sendStatus(200)
})

app.post('/FI/Notification', async (req, res) => {
    const { sessionId } = req.body.FIStatusNotification

    //Requesting new FI
    const { FI } = await axios.get('https://api-sandbox.onemoney.in/aa/FI/fetch/' + sessionId,
        { headers: { 'Content-Type': 'application/json', 'client_api_key': onemoney_config.client_api_key } })
        .then(r => r.data)
        .catch(e => console.log('FI fetch:', e))


    //Decrypting FI
    const xml_data = await axios.post('https://forwardsec-test-dwa5vy2nxq-ue.a.run.app/ecc/v1/decrypt', {
        base64Data: FI[0].data[0].encryptedFI,
        base64RemoteNonce: FI[0].KeyMaterial.Nonce,
        base64YourNonce: 'bURnRGpuOEdHc1VxZFdVN1NldTVna0E4YkM3a0ZVNW5=',
        ourPrivateKey: session_map.get(sessionId),
        remotePublicKey: FI[0].KeyMaterial.DHPublicKey.KeyValue
    }).then(r => atob(r.data.base64Data)).catch(e => console.error(e.toString(), session_map.get(sessionId)))

    if (xml_data)
        xml2js.parseString(xml_data, async (err, data) => {
            if (err) {
                console.log(err)
                return
            }
            let transaction_reference;
            //console.log('User:', data.Account.Profile[0].Holders[0].Holder[0].$.mobile)

            //Get last transaction(Possible future optimization)
            // const last_stored_transaction = await admin.firestore()
            //     .collection(`users/${data.Account.Profile[0].Holders[0].Holder[0].$.mobile}/transactions/`)
            //     .orderBy('timestamp', 'desc')
            //     .limit(1)
            //     .select('timestamp')
            //     .get()
            //     .then(snap => snap.docs?.[0]?.get('timestamp'))
            // console.log(moment(last_stored_transaction.toDate()).toISOString())

            //Add in the transactions that are new
            //console.log('Transactions:', data.Account.Transactions[0].Transaction.length)
            for (const transaction of data.Account.Transactions[0].Transaction) {
                transaction_reference = await admin.firestore()
                    .collection(`users/${data.Account.Profile[0].Holders[0].Holder[0].$.mobile}/transactions`)
                    .doc(transaction.$.txnId)
                    .get()

                if (!transaction_reference?.exists) {
                    await transaction_reference.ref.set({
                        timestamp: moment(transaction.$.transactionTimestamp),
                        amount: Number.parseFloat(transaction.$.amount),
                        narration: transaction.$.narration,
                        debit: transaction.$.type === 'DEBIT',
                    })
                }
            }
        })

    res.sendStatus(200)
})

export const index = functions.https.onRequest(app);