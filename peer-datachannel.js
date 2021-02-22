const sendTextInput = document.getElementById('input_text');
const receivedTextInput = document.getElementById('received_text');
const logTextInput = document.getElementById('log_text');
let peerConnection = null;
let dataChannel = null;
let candidates = [];
let hasReceivedSdp = false;

const roomId = 'horseman';
const clientId = 'icebergcwp1990';
var isInitiator = false;

const isSSL = location.protocol === 'https:';
const wsProtocol = isSSL ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + 'ayame-labo.shiguredo.jp/signaling';
const ws = new WebSocket(wsUrl);
ws.onopen = onWsOpen.bind();
ws.onclose = onWsClose.bind();
ws.onerror = onWsError.bind();
ws.onmessage = onWsMessage.bind();

clearUI();

function onWsError(error){
  myLogErr('ws onerror() ERROR:' + error);
}

function onWsOpen(event) {
  myLog('ws open()');
  register();
}

function onWsClose(event) {
  myLog('ws close()');
}

function onWsMessage(event) {
  myLog('ws onmessage() data:' + event.data);
  const message = JSON.parse(event.data);
  if (message.type === 'offer') {
    myLog('Received offer ...');
    const offer = new RTCSessionDescription(message);
    myLog('offer: ' + offer);
    setOffer(offer);
  }
  else if (message.type === 'answer') {
    myLog('Received answer ...');
    const answer = new RTCSessionDescription(message);
    myLog('answer: ' + answer);
    setAnswer(answer);
  }
  else if (message.type === 'candidate') {
    myLog('Received ICE candidate ...');
    const candidate = new RTCIceCandidate(message.ice);
    myLog('candidate: ' + candidate);
    if (hasReceivedSdp) {
      addIceCandidate(candidate);
    } else {
      candidates.push(candidate);
    }
  }
  else if (message.type === 'close') {
    myLog('peer connection is closed ...');
  }else if (message.type === 'ping') {
    doSendPong();
  }else if (message.type === 'accept') {
    if (message.isExistUser === true) {
      isInitiator = true;
    }else {
      isInitiator = false;
    }
    startSignaling(message.iceServers);
  }
}

function disconnect() {
  console.group();
  if (peerConnection) {
    if (peerConnection.iceConnectionState !== 'closed') {
      peerConnection.close();
      peerConnection = null;
      if (ws && ws.readyState === 1) {
        const message = JSON.stringify({ type: 'close' });
        ws.send(message);
      }
      myLog('sending close message');
      return;
    }
  }
  ws.close();
  myLog('peerConnection is closed.');
  console.groupEnd();
}

function drainCandidate() {
  hasReceivedSdp = true;
  candidates.forEach((candidate) => {
    addIceCandidate(candidate);
  });
  candidates = [];
}

function addIceCandidate(candidate) {
  if (peerConnection) {
    peerConnection.addIceCandidate(candidate);
  }else {
    myLogErr('PeerConnection does not exist!');
  }
}

function sendIceCandidate(candidate) {
  myLog('---sending ICE candidate ---');
  const message = JSON.stringify({ type: 'candidate', ice: candidate });
  myLog('sending candidate=' + message);
  ws.send(message);
}

function startSignaling(iceServers) {
  peerConnection = prepareNewConnection(iceServers);
  if (isInitiator === true) {
    myLog('make Offer');
    makeOffer();
  }else {
    myLog('I am an Answer');
  }
}

function prepareNewConnection(iceServers) {
  myLog('prepare new peer connection.');

  var peerConnectionConfig = {
    'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }]
  };

  if (iceServers != null) {
    peerConnectionConfig.iceServers = iceServers;
    myLog("Received iceServers: " + iceServers);
  }
  
  const peer = new RTCPeerConnection(peerConnectionConfig, {
    optional: [{
      'RtpDataChannels': true
    }]
  });

  if (isInitiator === true) {
    let options = {
    'ordered': true,
    'negotiated': false //if set to true, must set id property
    };
    dataChannel = peer.createDataChannel("MyDataChannel", options);
    configeDataChannel(dataChannel);
  }
  
  peer.onicecandidate = (event) => {
    myLog('-- peer.onicecandidate()');
    if (event.candidate) {
      myLog(event.candidate);
      sendIceCandidate(event.candidate);
    } else {
      myLog('empty ice event');
    }
  };

  peer.oniceconnectionstatechange = () => {
    myLog('-- peer.oniceconnectionstatechange()');
    myLog('ICE connection Status has changed to ' + peer.iceConnectionState);
    switch (peer.iceConnectionState) {
      case 'closed':
      case 'failed':
      case 'disconnected':
        break;
    }
  };

  peer.ondatachannel = (event) => {
    dataChannel = event.channel;
    myLog('New data channel..');
    configeDataChannel(dataChannel);
  };
  
  return peer;
}

function configeDataChannel(dc) {
  dc.onclose = () => myLog('dataChannel => has closed');
  dc.onopen = () => myLog('dataChannel => has opened');
  dc.onmessage = function (event) {
    myLog("dataChannel => received message: " + event.data);
    receivedTextInput.value += "\n" + event.data;
  };
}

function sendSdp(sessionDescription) {
  myLog('---sending sdp ---');
  const message = JSON.stringify(sessionDescription);
  myLog('sending SDP=' + message);
  ws.send(message);
}

async function makeOffer() {
  try {
    const sessionDescription = await peerConnection.createOffer({
      'offerToReceiveAudio': false,
      'offerToReceiveVideo': false
    })
    myLog('createOffer() success in promise, SDP=' + sessionDescription.sdp);
    await peerConnection.setLocalDescription(sessionDescription);
    myLog('setLocalDescription() success in promise');
    sendSdp(peerConnection.localDescription);
  } catch (error) {
    myLogErr('makeOffer() ERROR:' + error);
  }
}

async function makeAnswer() {
  myLog('sending Answer. Creating remote session description...');
  if (!peerConnection) {
    myLogErr('peerConnection DOES NOT exist!');
    return;
  }
  try {
    const sessionDescription = await peerConnection.createAnswer();
    myLog('createAnswer() success in promise');
    await peerConnection.setLocalDescription(sessionDescription);
    myLog('setLocalDescription() success in promise');
    sendSdp(peerConnection.localDescription);
    drainCandidate();
  } catch (error) {
    myLogErr('makeAnswer() ERROR:' + error);
  }
}

// offer sdp を生成する
async function setOffer(sessionDescription) {
  myLog('Set offser...');
  if (!peerConnection) {
    myLogErr('peerConnection DOES NOT exist!');
    return;
  }
  try{
      myLog('will setRemoteDescription...');
      await peerConnection.setRemoteDescription(sessionDescription);
      myLog('setRemoteDescription(offer) success in promise');
      makeAnswer();
  }catch(error) {
      myLogErr('setRemoteDescription(offer) ERROR: ' + error);
  }
}

async function setAnswer(sessionDescription) {
  if (!peerConnection) {
    myLogErr('peerConnection DOES NOT exist!');
    return;
  }
  try {
    await peerConnection.setRemoteDescription(sessionDescription);
    myLog('setRemoteDescription(answer) success in promise');
    drainCandidate();
  } catch(error) {
    myLogErr('setRemoteDescription(answer) ERROR: ' + error);
  }
}


function sendDataChannel() {
  let text = sendTextInput.value;
  if (text.length == 0) {
    return;
  }
  if (dataChannel == null || dataChannel.readyState != "open") {
    return;
  }
  dataChannel.send(text);
  sendTextInput.value = "";
}

//Signaling
async function register() {
  let json = {
    type: 'register',
    clientId: clientId,
    roomId: roomId,
    ayameClient: 'Ayame webrtc JS client v1.0',
    libwebrtc: 'Ayame JS build',
    environment: 'Ayame JS env'
  };
  const message = JSON.stringify(json);
  myLog('register JSON=' + message);
  ws.send(message);
}

async function doSendPong() {
  let json = {type: 'pong'};
  const message = JSON.stringify(json);
  ws.send(message);  
}

function myLog(text) {
  logTextInput.value += "\n" + text;
  console.log(text);
}

function myLogErr(text) {
  logTextInput.value += "\n Error => " + text;
  console.error(text);
}

function clearUI() {
  logTextInput.value = "";
  sendTextInput.value = "";
  receivedTextInput.value = "";
}


