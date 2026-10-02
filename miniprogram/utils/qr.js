const qrcode=require('../vendor/qrcode-generator/index');
// Four-module quiet zone; lossless, opaque black/white GIF, encoded fully offline.
function image(payload){const qr=qrcode(0,'M');qr.addData(payload,'Byte');qr.make();return qr.createDataURL(6,24);}
module.exports={image};
