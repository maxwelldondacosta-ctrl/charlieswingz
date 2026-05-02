require('dotenv').config();
console.log('Resend:', !!process.env.RESEND_API_KEY);
console.log('Twilio:', !!process.env.TWILIO_ACCOUNT_SID);
console.log('Owner:', process.env.OWNER_PHONE ? 'SET' : 'NOT SET');
const db = require('./db');
const orders = db.getTodaysOrders();
if (orders.length) {
  const o = orders[0];
  console.log('Latest order:', o.id.slice(-6));
  console.log('Pref:', o.contact_pref);
  console.log('Phone:', o.customer_phone);
  console.log('Email:', o.customer_email);
  console.log('Status:', o.status);
} else {
  console.log('No orders today');
}
