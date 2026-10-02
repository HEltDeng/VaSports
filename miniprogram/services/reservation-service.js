const p=require('./provider');
module.exports={list:p.listReservations,get:p.getReservation,create:p.createReservation,cancel:p.cancelReservation};
