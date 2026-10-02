Component({properties:{reservation:Object},methods:{code(){this.triggerEvent("code",{id:this.data.reservation.id});},cancel(){this.triggerEvent('cancel',{id:this.data.reservation.id});}}});
