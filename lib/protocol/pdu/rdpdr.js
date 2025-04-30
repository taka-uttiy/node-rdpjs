/*
 * Copyright (c) 2025 Takayuki Uchida
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


/* RDPDR_HEADER.Component */
var RDPDR_CTYP = {
	RDPDR_CTYP_CORE : 0x4472,
	RDPDR_CTYP_PRN : 0x5052
};

/* RDPDR_HEADER.PacketId */
var RDPDR_PAKID = {
	PAKID_CORE_SERVER_ANNOUNCE		: 0x496E,
	PAKID_CORE_CLIENTID_CONFIRM		: 0x4343,
	PAKID_CORE_CLIENT_NAME 			: 0x434E,
	PAKID_CORE_DEVICELIST_ANNOUNCE	: 0x4441,
	PAKID_CORE_DEVICE_REPLY 		: 0x6472,
	PAKID_CORE_DEVICE_IOREQUEST 	: 0x4952,
	PAKID_CORE_DEVICE_IOCOMPLETION	: 0x4943,
	PAKID_CORE_SERVER_CAPABILITY	: 0x5350,
	PAKID_CORE_CLIENT_CAPABILITY	: 0x4350,
	PAKID_CORE_DEVICELIST_REMOVE	: 0x444D,
	PAKID_CORE_USER_LOGGEDON		: 0x554C,
	PAKID_PRN_CACHE_DATA			: 0x5043,
	PAKID_PRN_USING_XPS 			: 0x5543
};

var RDPDR_CAP_TYPE = {
	CAP_GENERAL_TYPE	: 0x0001,
	CAP_PRINTER_TYPE 	: 0x0002,
	CAP_PORT_TYPE 		: 0x0003,
	CAP_DRIVE_TYPE 		: 0x0004,
	CAP_SMARTCARD_TYPE	: 0x0005
};
var RDPDR_CAP_EXT_PDU = {
	DEVICE_REMOVE_PDUS		: 0x00000001,
	CLIENT_DISPLAY_NAME_PDU	: 0x00000002,
	USER_LOGGEDON_PDU		: 0x00000004
};

var RDPDR_DEVTYPE = {
	RDPDR_DTYP_SERIAL		: 0x00000001,
	RDPDR_DTYP_PARALLEL		: 0x00000002,
	RDPDR_DTYP_PRINT		: 0x00000004,
	RDPDR_DTYP_FILESYSTEM	: 0x00000008,
	RDPDR_DTYP_SMARTCARD	: 0x00000020
};

/**
 *
 */
function RdpDR(transport) {
	this.transport = transport;
}

//inherit from Layer
inherits(RdpDR, events.EventEmitter);

/**
 * Client side of Global channel automata
 * @param transport
 */
function Client(transport) {
	RdpDR.call(this, transport);
	var self = this;
	self.chunkedArray = null;
	self.clientId = -1;

	this.transport.on('rdpdr', function(s) {
		self.recv(s);			
	});
}

function rdpdrHeader() {
	var self = {
		component : new type.UInt16Le(),
		packetId : new type.UInt16Le()
	};
	return new type.Component(self);
}

function serverAnnounceRequest() {
	var self = {
		versionMajor : new type.UInt16Le(),
		versionMinor : new type.UInt16Le(),
		channelId : new type.UInt32Le()
	};
	return new type.Component(self);
}
function serverCoreCapabilityRequestHeader() {
	var self = {
		numCapabilities : new type.UInt16Le(),
		padding : new type.UInt16Le()
	};
	return new type.Component(self);
}
function capabilityHeader() {
	var self = {
		capType : new type.UInt16Le(),
		capLength : new type.UInt16Le(),
		capVersion : new type.UInt32Le()
	};
	return new type.Component(self);
}
function capability_general() {
	var self = {
		osType: new type.UInt32Le(),
		osVersion: new type.UInt32Le(),
		protocolMajorVersion : new type.UInt16Le(),
		protocolMinorVersion : new type.UInt16Le(), 
		ioCode1 : new type.UInt32Le(),
		ioCode2 : new type.UInt32Le(),
		extendedPDU : new type.UInt32Le(),
		extraFlags1 : new type.UInt32Le(),
		extraFlags2 : new type.UInt32Le(),
		specialTypeDeviceCap : new type.UInt32Le(),
	};
	return new type.Component(self);
}
function deviceAnnounceResp() {
	var self = {
		deviceId : new type.UInt32Le(),	
		resultCode : new type.UInt32Le()
	};
	return new type.Component(self);
}


function clientAnnounceReply() {
	var self = {
		versionMajor : new type.UInt16Le(1),
		versionMinor : new type.UInt16Le(5),
		channelId : new type.UInt32Le(this.channelId)
	};
	return new type.Component(self);
}
function clientCapability_general(srv_general) {
	var self = {
		// capability header
		capType : new type.UInt16Le(RDPDR_CAP_TYPE.CAP_GENERAL_TYPE),
		capLength : new type.UInt16Le( function() { return new type.Component(self).size(); }),
		capVersion : new type.UInt32Le(2),
		// GENERAL_CAPS_SET
		osType: new type.UInt32Le(0),
		osVersion: new type.UInt32Le(0),
		protocolMajorVersion : new type.UInt16Le(1),
		protocolMinorVersion : new type.UInt16Le(5), 
		//ioCode1 : new type.UInt32Le(0x0000FFFF & srv_general.ioCode1),
		ioCode1 : new type.UInt32Le(0x0000FFFF),
		ioCode2 : new type.UInt32Le(0),
		extendedPDU : new type.UInt32Le(RDPDR_CAP_EXT_PDU.DEVICE_REMOVE_PDUS | RDPDR_CAP_EXT_PDU.CLIENT_DISPLAY_NAME_PDU),
		extraFlags1 : new type.UInt32Le(0),
		extraFlags2 : new type.UInt32Le(0),
		specialTypeDeviceCap : new type.UInt32Le(0)
	};
	return new type.Component(self);
}
function clientCapability_hdronly(ty, ver) {
	var self = {
		// capability header
		capType : new type.UInt16Le(ty),
		capLength : new type.UInt16Le( function() { return new type.Component(self).size(); }),
		capVersion : new type.UInt32Le(ver)
	};
	return new type.Component(self);
}
function clientCoreCapalilityResponse(srv_general) {
	var caps = new type.Component([]);
	caps.obj.push( clientCapability_general(srv_general) );
	//caps.obj.push( clientCapability_hdronly(RDPDR_CAP_TYPE.CAP_PORT_TYPE, 1) );
	//caps.obj.push( clientCapability_hdronly(RDPDR_CAP_TYPE.CAP_PRINTER_TYPE, 1) );
	//caps.obj.push( clientCapability_hdronly(RDPDR_CAP_TYPE.CAP_DRIVE_TYPE, 2) );
	//caps.obj.push( clientCapability_hdronly(RDPDR_CAP_TYPE.CAP_SMARTCARD_TYPE, 1) );

	var self = {
		numCapabilities : new type.UInt16Le(caps.obj.length),
		padding : new type.UInt16Le(),
		capabilitiyes : caps
	};
	return new type.Component(self);
}

function deviceDef(ty, id, name) {
	var bn = new Buffer.alloc(8);
	bn.write(name);

	var self = {
		deviceType : new type.UInt32Le(ty),
		deviceId : new type.UInt32Le(id),
		preferredDosName : new type.BinaryString(bn, { readLength : new type.CallableValue(8) }),
		deviceDataLength : new type.UInt32Le(0)
	};
	return new type.Component(self);
}
function clientCoreDeviceListAnnounceRequest() {
	var devices = new type.Component([]);
	//devices.obj.push( deviceDef(RDPDR_DEVTYPE.RDPDR_DTYP_FILESYSTEM, 1, "D:")  );

	if (devices.obj.length == 0) {
		var self = {
			deviceCount : new type.UInt32Le(0)
		};
		return new type.Component(self);
	}

	var self = {
		deviceCount : new type.UInt32Le(devices.obj.length),
		devices : devices
	};
	return new type.Component(self);
}


// inherit from Layer
inherits(Client, RdpDR);

Client.prototype.send = function(packetId, data) {
	var dlen = data.size();
	if (dlen <= 1598) {
		this.transport.send_channel('rdpdr', 
			new type.Component([
				// channel header
   			 	new type.UInt32Le(dlen + 4),
				new type.UInt32Le(svc.chFlag.first | svc.chFlag.last),
				// rdpdr header
				new type.UInt16Le(RDPDR_CTYP.RDPDR_CTYP_CORE), 
				new type.UInt16Le(packetId), 
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
		this.recvMsg(s);
	} else {
		if (flag & svc.chFlag.first) {
			delete self.chunkedArray;
			self.chunkedArray = [];
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
			delete cs;
		}
	}

	//this.transport.once('rdpdr', function(s) {
	//	self.recv(s);
	//});
};



Client.prototype.recvMsg = function(s) {
	var hdr = rdpdrHeader().read(s).obj;

	switch (hdr.packetId.value) {
	case RDPDR_PAKID.PAKID_CORE_SERVER_ANNOUNCE:
		this.recv_serverAnnounceRequest(s);
		break;
	case RDPDR_PAKID.PAKID_CORE_SERVER_CAPABILITY:
		this.recv_serverCoreCapabilityRequest(s);
		break;
	case RDPDR_PAKID.PAKID_CORE_CLIENTID_CONFIRM:
		this.recv_serverCoreClientIdConfirm(s);
		break;
	case RDPDR_PAKID.PAKID_CORE_DEVICE_REPLY:
		this.recv_serverCoreDeviceReply(s);
		break;
	case RDPDR_PAKID.PAKID_CORE_DEVICE_IOREQUEST:

		break;
	default:


	}
}

Client.prototype.recv_serverAnnounceRequest = function(s) {
	var msg = serverAnnounceRequest().read(s).obj;

	this.channelId = msg.channelId.value;

	// send [Client Announce Reply]
	this.send( RDPDR_PAKID.PAKID_CORE_CLIENTID_CONFIRM, clientAnnounceReply() );
}

Client.prototype.recv_serverCoreCapabilityRequest = function(s) {
	var hdr = serverCoreCapabilityRequestHeader().read(s).obj;

	var capNum = hdr.numCapabilities.value;
	for (var i=0; i<capNum; i++) {
		var capHdr = capabilityHeader().read(s).obj;
		
		switch (capHdr.capType.value) {
		case RDPDR_CAP_TYPE.CAP_GENERAL_TYPE:
			this.cap_server_general = capability_general().read(s).obj;
			break;
		case RDPDR_CAP_TYPE.CAP_PORT_TYPE:
		case RDPDR_CAP_TYPE.CAP_SMARTCARD_TYPE:
		case RDPDR_CAP_TYPE.CAP_PRINTER_TYPE:
		case RDPDR_CAP_TYPE.CAP_DRIVE_TYPE:
		defalut:
			// no cap data
			break;
		}
	}

	// send [Client Core Capability Response]
	this.send( RDPDR_PAKID.PAKID_CORE_CLIENT_CAPABILITY, clientCoreCapalilityResponse(this.cap_server_general) );
}

Client.prototype.recv_serverCoreClientIdConfirm = function(s) {
	var msg = serverAnnounceRequest().read(s).obj;

	// send [Client Device List Announce Request]
	this.send( RDPDR_PAKID.PAKID_CORE_DEVICELIST_ANNOUNCE, clientCoreDeviceListAnnounceRequest()  );
}

Client.prototype.recv_serverCoreDeviceReply = function(s) {
	var msg = deviceAnnounceResp(). read(s).obj;
	
	// TBD
}

/**	 
 * Module exports
 */
module.exports = {
	Client : Client
};