/*
 * Copyright (c) 2025- Takayuki Uchida
 *
 * This file is part of node-rdpjs.
 *
 * node-rdpjs is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var inherits = require('util').inherits;
var events = require('events');
var caps = require('./caps');
var data = require('./data');
var svc = require('./svc');
var type = require('../../core').type;
var log = require('../../core').log;

// RDPSND PDU Header : msgType
var RDPSND_MsgType = {
	SNDC_CLOSE 			: 0x01,
	SNDC_WAVE			: 0x02,
	SNDC_SETVOLUME		: 0x03,
	SNDC_SETPITCH1		: 0x04,
	SNDC_WAVECONFIRM	: 0x05,
	SNDC_TRAINING		: 0x06,
	SNDC_FORMATS		: 0x07,
	SNDC_CRYPTKEY 		: 0x08,
	SNDC_WAVEENCRYPT 	: 0x09,
	SNDC_UDPWAVE 		: 0x0A,
	SNDC_UDPWAVELAST	: 0x0B,
	SNDC_QUALITYMODE 	: 0x0C,
	SNDC_WAVE2 			: 0x0D
};

var RDPSND_Caps = {
	TSSNDCAPS_ALIVE		: 0x00000001,
	TSSNDCAPS_VOLUME	: 0x00000002,
	TSSNDCAPS_PITCH		: 0x00000004
};

var RDPSMD_WAVE_Fmt = {
	WAVE_FORMAT_PCM		: 0x0001,
	WAVE_FORMAT_ADPCM	: 0x0002,
	WAVE_FORMAT_ALAW	: 0x0006,
	WAVE_FORMAT_MULAW	: 0x0007
};



function RdpSND(transport) {
	this.transport = transport;
}

//inherit from Layer
inherits(RdpSND, events.EventEmitter);

/**
 * Client side of Global channel automata
 * @param transport
 */
function Client(transport) {
	RdpSND.call(this, transport);
	var self = this;
	self.chunkedArray = null;
	self.opecode = -1;
	self.datalen = 0;
	self.audioFormats = null;
	self.audioFormatNo = 0;
	self.wavetop = null;
	self.waveTimestamp = 0;

	this.transport.on('rdpsnd', function(s) {
		self.recv(s);			
	});
}

function rdpsndHeader() {
	var self = {
		msgType : new type.UInt8(),
		bPad : new type.UInt8(),
		bodySize : new type.UInt16Le()
	};
	return new type.Component(self);
}

function audioFormat(data, noData=false) {
	var self = {
		wFormatTag : new type.UInt16Le(),
		nChannels : new type.UInt16Le(),
		nSamplesPerSec : new type.UInt32Le(),
		nAvgBytesPerSec : new type.UInt32Le(),
		nBlockAlign : new type.UInt16Le(),
		wBitsPerSample : new type.UInt16Le(),
		cbSize : new type.UInt16Le(),
		data : data || new type.Factory(function(s) {
			if (self.cbSize.value > 0) {
				self.data = new type.BinaryString(null, { readLength : new type.CallableValue(self.cbSize.value) }).read(s);
			}
		})
	};
	if (noData) delete self.data;
	return new type.Component(self);
}

function audioFormats(sndFmts) {
	var self = {
		dwFlags : new type.UInt32Le(),
		dwVolume : new type.UInt32Le(),
		dwPitch : new type.UInt32Le(),
		wDGramPort : new type.UInt16Le(),
		wNumberOfFormats : new type.UInt16Le(),
		cLastBlockConfirmed : new type.UInt8(),
		wVersion : new type.UInt16Le(),
		bPad : new type.UInt8(),
		sndFormats : sndFmts || new type.Factory( function (s) {
			self.sndFormats = new type.Component([]);
			for (var i=0; i<self.wNumberOfFormats.value; i++) {
				var audiofmt = audioFormat().read(s);
				self.sndFormats.obj.push(audiofmt);
			}
		})
	};
	return new type.Component(self);
}

function training(data=null, noData=false) {
	var self = {
		wTimeStamp : new type.UInt16Le(),
		wPackSize :  new type.UInt16Le(),	
		data : data || new type.Factory(function(s) {
			if (self.wPackSize.value > 0) {
                self.data = new type.BinaryString(null, { readLength : new type.CallableValue(self.wPackSize.value) }).read(s);
            }
        })
	};
	if (noData) delete self.data;
	return new type.Component(self);
}

function volume() {
	var self = {
		volume : new type.UInt32Le(),
	};
	return new type.Component(self);
}

function waveInfo() {
	var self = {
		wTimeStamp : new type.UInt16Le(),
		wFormatNo : new type.UInt16Le(),
		cBlockNo : new type.UInt8(),
        bPad1 : new type.UInt8(),
        bPad2 : new type.UInt8(),
        bPad3 : new type.UInt8(),
		data : new type.Factory(function(s) {
			self.data = new type.BinaryString(null, { readLength : new type.CallableValue(4) }).read(s);
		})
	};
	return new type.Component(self);
}


// inherit from Layer
inherits(Client, RdpSND);

Client.prototype.send = function(msgType, data) {
	var dlen = data.size();
	if (dlen <= 1598) {
		this.transport.send_channel('rdpsnd',
			new type.Component([
				// channel header
				new type.UInt32Le(dlen + 4),
				new type.UInt32Le(svc.chFlag.first | svc.chFlag.last),
				// rdpsnd header	 
				new type.UInt8(msgType),
				new type.UInt8(0),
				new type.UInt16Le(dlen), 
				// rdpdr data
				data
			])
		);
	} else {
	
		// TBD
	
	}   
}

Client.prototype.recv = function(s) {
	var self = this;

	// channel header
	var chHdr = svc.chHdr().read(s).obj;
	var flag = chHdr.flags.value;
	var mlen = chHdr.length.value;
	if ((flag & svc.chFlag.first) && (flag & svc.chFlag.last)) {
		self.recvMsg(s);
	} else {
		if (flag & svc.chFlag.first) {
			delete self.chunkedArray;
			self.chunkedArray = [];
			self.datalen = mlen;	
		}
		// add s to self.stream	 
		self.chunkedArray.push( s.buffer.slice(s.offset, s.offset + mlen) );
		s.offset += mlen;
		if (flag & svc.chFlag.last) {
			var blen = 0;
			for (var i=0; i<self.chunkedArray.length; i++) {
				blen += self.chunkedArray[i].length;
			}
			var cs = new type.Stream( Buffer.concat(self.chunkedArray, blen) );
			delete self.chunkedArray;
			self.chunkedArray = null;
			this.recvMsg(cs);
			self.opecode = -1;	
			self.datalen = 0;
			delete cs;
		}
	}
};

Client.prototype.recv_serverFormats = function(s) {
	var msg = audioFormats().read(s).obj;
	
	// reply Client Audio Formats
	delete this.audioFormats;
	this.audioFormats = new type.Component([]);

	for (var i=0; i<msg.wNumberOfFormats.value; i++) {
		// Support Formats
		var tag = msg.sndFormats.obj[i].obj.wFormatTag.value;
		if (tag != RDPSMD_WAVE_Fmt.WAVE_FORMAT_PCM)
			continue;
		var ch = msg.sndFormats.obj[i].obj.nChannels.value;
		if (ch != 1 && ch != 2)
			continue;
		var samp = msg.sndFormats.obj[i].obj.wBitsPerSample.value;
		if (samp != 8 && samp != 16)
			continue;
		var sampSec = msg.sndFormats.obj[i].obj.nSamplesPerSec.value;
		// alsa			
		//if (sampSec != 44100 && sampSec != 22050)
		//	continue;

		// make Formats
		if (msg.sndFormats.obj[i].obj.cbSize.value > 0) {
			var afmt = audioFormat(msg.sndFormats.obj[i].obj.data);
		} else {
			var afmt = audioFormat(null, true);
		}
		afmt.obj.wFormatTag.value = tag;
		afmt.obj.nChannels.value = ch;
		afmt.obj.nSamplesPerSec.value = sampSec;
		afmt.obj.nAvgBytesPerSec.value = msg.sndFormats.obj[i].obj.nAvgBytesPerSec.value;
		afmt.obj.nBlockAlign.value = msg.sndFormats.obj[i].obj.nBlockAlign.value;
		afmt.obj.wBitsPerSample.value = samp;
		afmt.obj.cbSize.value = msg.sndFormats.obj[i].obj.cbSize.value;
		this.audioFormats.obj.push( afmt );
	}	
	// send client formats
	var cAudFmt = audioFormats(this.audioFormats);	
	cAudFmt.obj.dwFlags.value = RDPSND_Caps.TSSNDCAPS_ALIVE | RDPSND_Caps.TSSNDCAPS_VOLUME;
	cAudFmt.obj.dwVolume.value = 0xFFFFFFFF;
	cAudFmt.obj.dwPitch.value = 0;
	cAudFmt.obj.wNumberOfFormats.value = this.audioFormats.obj.length;
	cAudFmt.obj.cLastBlockConfirmed.value = 0;
	cAudFmt.obj.wVersion.value = 2;
	cAudFmt.obj.bPad.value = 0;
	this.send( RDPSND_MsgType.SNDC_FORMATS, cAudFmt );
}

Client.prototype.recv_training = function(s) {
	var msg = training().read(s).obj;

	// send traing confirm
	var trcfm = training(null, true);
	trcfm.obj.wTimeStamp.value = msg.wTimeStamp.value;
	trcfm.obj.wPackSize.value = msg.wPackSize.value;
	this.send( RDPSND_MsgType.SNDC_TRAINING, trcfm );
}

Client.prototype.recv_volume = function(s) {
	var msg = volume().read(s).obj;

	// emit
	this.emit('audio_vol', {
		volume :  msg.wTimeStamp.value
	});
}

Client.prototype.recv_waveinfo = function(s, hdr) {
	var msg = waveInfo().read(s).obj;

	this.opecode = RDPSND_MsgType.SNDC_WAVE;
	this.audioFormatNo = msg.wFormatNo.value;
	this.wavetop = new Buffer( msg.data.value );
	this.waveTimestamp = msg.wTimeStamp.value;
}

Client.prototype.recv_wave = function(s) {
	this.wavetop.copy(s.buffer, 0);
	delete this.wavetop;
	this.wavetop = null;
	
	// emit
	var audioFormat = this.audioFormats.obj[this.audioFormatNo];
	this.emit('audio', {
		channel: audioFormat.obj.nChannels.value, 
		rate: audioFormat.obj.nSamplesPerSec.value, 
		bitsPerSample: audioFormat.obj.wBitsPerSample.value,
		timestamp: this.waveTimestamp,
		data: s.buffer
	});
}

Client.prototype.recvMsg = function(s) {
	// WAVE PDU continued WAVE INFO
	if (this.opecode == RDPSND_MsgType.SNDC_WAVE) {
		this.recv_wave(s);
		return;
	}

	var hdr = rdpsndHeader().read(s).obj;
	
	switch (hdr.msgType.value) {
	case RDPSND_MsgType.SNDC_WAVE:
		this.recv_waveinfo(s, hdr);
		break;
	case RDPSND_MsgType.SNDC_CLOSE:

		break;
	case RDPSND_MsgType.SNDC_FORMATS:
		this.recv_serverFormats(s);		
		break;
	case RDPSND_MsgType.SNDC_TRAINING:
		this.recv_training(s);
		break;
	case RDPSND_MsgType.SNDC_SETVOLUME:
		this.recv_volume(s);
		break;
	default:
		break;
	}
}

/**	 
 * Module exports
 */
module.exports = {
	Client : Client
};