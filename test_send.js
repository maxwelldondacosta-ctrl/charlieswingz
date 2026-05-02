require('dotenv').config();
const { notifyStatusUpdate } = require('./notifications');
const db = require('./db');
const orders = db.getTodaysOrders();
const o = orders[0];
console.log('Testing status notification for order', o.id.slice(-6));
console.log('Pref:', o.contact_pref, 'Email:', o.customer_email, 'Phone:', o.customer_phone);
notifyStatusUpdate(o, 'out_for_delivery').then(() => {
  console.log('DONE - notification function completed');
}).catch(err => {
  console.log('ERROR:', err.message);
});
