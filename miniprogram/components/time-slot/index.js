Component({properties:{timeInfo:Object,selected:Boolean},methods:{choose(){if(this.data.timeInfo.status==='AVAILABLE')this.triggerEvent('select',{value:this.data.timeInfo.timeSlot});}}});
