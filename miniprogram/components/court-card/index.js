Component({properties:{court:Object,unit:String,selected:Boolean},methods:{choose(){if(this.data.court.free)this.triggerEvent('select',{number:this.data.court.number});}}});
