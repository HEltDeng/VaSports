Component({properties:{venue:Object,compact:{type:Boolean,value:false}},methods:{open(){this.triggerEvent('select',{id:this.data.venue.id});}}});
