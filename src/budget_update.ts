import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin';

export let budget_update = functions.runWith({ memory: '1GB' })
    .firestore
    .document('/users/{user}')
    .onUpdate(async (change, context) => {
        const after = change.after.data().budgets
        const before = change.before.data().budgets
        if(before !== after) {
           let numOfRecords = 0 
           while(after[numOfRecords]){
               if(!before[numOfRecords]){
                admin.firestore().collection(`/users/${context.params.user}/transactions`)
                .where('vendor','==',after[numOfRecords].name).get()
                .then( function (snapshot){
                   if (snapshot.empty) {console.log('No matching transactions for this vendor.');return;}  
                    snapshot.forEach(snapshotRow => {
                        const values = snapshotRow.data()
                        after[numOfRecords].value += values.amount || 0    
                    })
                    console.log('budgetVal :: ' ,after[numOfRecords].value)
                }).catch(e => admin.firestore().collection('prediction_errors')
                .add({ narration: 'budgetUpdate', timestamp: context.timestamp, error: e.toString() })
                .then(ref => 'Undefined'))
                numOfRecords++
            }else{numOfRecords++}}
        const updated = await admin.firestore()
        .doc(`/users/${context.params.user}`).update({ budgets:after })
        return updated
        }else {console.log('Nothing to do! ') ; return null;}
    });