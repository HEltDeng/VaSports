Component({properties:{days:Array,value:String},methods:{choose(e){this.triggerEvent('change',{value:e.currentTarget.dataset.value});}}});
