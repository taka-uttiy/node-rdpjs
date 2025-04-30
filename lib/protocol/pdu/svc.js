var inherits = require('util').inherits;
var events = require('events');
var caps = require('./caps');
var data = require('./data');
var type = require('../../core').type;
var log = require('../../core').log;

var chFlag = {
	first : 0x01,
	last : 0x02
};

function chHdr() {
    var self = {
        length : new type.UInt32Le(),
        flags : new type.UInt32Le()
    };
    return new type.Component(self);
}

/**     
 * Module exports
 */
module.exports = {
	chFlag : chFlag,
	chHdr : chHdr
};