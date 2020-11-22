import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin';
import * as moment from 'moment'



export const transaction_aggregator = async (snap: functions.firestore.DocumentSnapshot, context: functions.EventContext, vendor: string) => {
        const user = (await admin.firestore().doc(`/users/${context.params.user}`).get()).data()
        if(!user) return

        //Spend Category
        const spend_update = user.top_spends.findIndex((cat: { category: string; }) => cat.category.toLowerCase() === vendor)
        if(spend_update > -1) user.top_spends[spend_update].size += Math.round(snap?.data()?.amount) || 0
        else user.top_spends.push({category: vendor, color: (Math.random() * 999999).toFixed(0), size: Math.round(snap?.data()?.amount) || 0})

        //Budgets
        const budget_update = user.budgets.findIndex((cat: { name: string; }) => cat.name.toLowerCase() === vendor)
        if(budget_update > -1) user.budgets[budget_update].value += Math.round(snap?.data()?.amount) || 0
        else user.budgets.push({colour : (Math.random() * 999999).toFixed(0),name:vendor,total:0,value:Math.round(snap?.data()?.amount) || 0})

        //check and fix ytd_balance array
        const currentMonth = moment().format("MMM") 
        while(user.ytd_balance[11].month !== currentMonth){
            user.ytd_balance.push({month:user.ytd_balance[0].month ,amount:0})
            user.ytd_balance.shift()       
        }
        //Monthly Spends
        const diff_in_months = moment(moment.now()).diff(moment(snap.get('timestamp').toDate()), 'months')
        if (snap?.data()?.debit && diff_in_months < 12) {
            user.ytd_balance[11 - diff_in_months].amount += Math.round(snap?.data()?.amount) || 0   
            await admin.firestore()
                .doc(`/users/${context.params.user}`)
                .update({ ytd_balance:  user.ytd_balance, top_spends: user.top_spends, budgets:user.budgets })
        }
    };