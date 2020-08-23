const dataTextInput = document.getElementById('data_text');
let peerConnection = null;
let dataChannel = null;
let candidates = [];
let hasReceivedSdp = false;
// iceServer を定義
const iceServers = [{ 'urls': 'stun:stun.l.google.com:19302' }];
// peer connection の 設定
const peerConnectionConfig = {
  'iceServers': iceServers
};

const roomId = 'horseman';
const clientId = 'icebergcwp1990';
var isInitiator = false;

const isSSL = location.protocol === 'https:';
const wsProtocol = isSSL ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + 'ayame-lite.shiguredo.jp/signaling';
const ws = new WebSocket(wsUrl);
ws.onopen = onWsOpen.bind();
ws.onclose = onWsClose.bind();
ws.onerror = onWsError.bind();
ws.onmessage = onWsMessage.bind();

function onWsError(error){
  console.error('ws onerror() ERROR:', error);
}

function onWsOpen(event) {
  console.log('ws open()');
  register();
}

function onWsClose(event) {
  console.log('ws close()');
}

function onWsMessage(event) {
  console.log('ws onmessage() data:', event.data);
  const message = JSON.parse(event.data);
  if (message.type === 'offer') {
    console.log('Received offer ...');
    const offer = new RTCSessionDescription(message);
    console.log('offer: ', offer);
    setOffer(offer);
  }
  else if (message.type === 'answer') {
    console.log('Received answer ...');
    const answer = new RTCSessionDescription(message);
    console.log('answer: ', answer);
    setAnswer(answer);
  }
  else if (message.type === 'candidate') {
    console.log('Received ICE candidate ...');
    const candidate = new RTCIceCandidate(message.ice);
    console.log('candidate: ', candidate);
    if (hasReceivedSdp) {
      addIceCandidate(candidate);
    } else {
      candidates.push(candidate);
    }
  }
  else if (message.type === 'close') {
    console.log('peer connection is closed ...');
  }else if (message.type === 'ping') {
    doSendPong();
  }else if (message.type === 'accept') {
    if (message.isExistUser === true) {
      isInitiator = true;
    }
    startSignaling();
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
      console.log('sending close message');
      return;
    }
  }
  ws.close();
  console.log('peerConnection is closed.');
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
    console.error('PeerConnection does not exist!');
  }
}

function sendIceCandidate(candidate) {
  console.log('---sending ICE candidate ---');
  const message = JSON.stringify({ type: 'candidate', ice: candidate });
  console.log('sending candidate=' + message);
  ws.send(message);
}

function prepareNewConnection() {
  console.log('prepare new peer connection.');
  const peer = new RTCPeerConnection(peerConnectionConfig);
  dataChannel = peer.createDataChannel("MyDataChannel");
  
  peer.onicecandidate = (event) => {
    console.log('-- peer.onicecandidate()');
    if (event.candidate) {
      console.log(event.candidate);
      sendIceCandidate(event.candidate);
    } else {
      console.log('empty ice event');
    }
  };

  peer.oniceconnectionstatechange = () => {
    console.log('-- peer.oniceconnectionstatechange()');
    console.log('ICE connection Status has changed to ' + peer.iceConnectionState);
    switch (peer.iceConnectionState) {
      case 'closed':
      case 'failed':
      case 'disconnected':
        break;
    }
  };

  dataChannel.onmessage = function (event) {
    console.log("Got Data Channel Message:", new TextDecoder().decode(event.data));
  };
  
  return peer;
}

function sendSdp(sessionDescription) {
  console.log('---sending sdp ---');
  const message = JSON.stringify(sessionDescription);
  console.log('sending SDP=' + message);
  ws.send(message);
}

function startSignaling() {
  peerConnection = prepareNewConnection();
  if (isInitiator === true) {
    console.log('make Offer');
    makeOffer();
  }else {
    console.log('I am an Answer');
  }
}

async function makeOffer() {
  try {
    const sessionDescription = await peerConnection.createOffer({
      'offerToReceiveAudio': false,
      'offerToReceiveVideo': false
    })
    console.log('createOffer() success in promise, SDP=', sessionDescription.sdp);
    await peerConnection.setLocalDescription(sessionDescription);
    console.log('setLocalDescription() success in promise');
    sendSdp(peerConnection.localDescription);
  } catch (error) {
    console.error('makeOffer() ERROR:', error);
  }
}

async function makeAnswer() {
  console.log('sending Answer. Creating remote session description...');
  if (!peerConnection) {
    console.error('peerConnection DOES NOT exist!');
    return;
  }
  try {
    const sessionDescription = await peerConnection.createAnswer();
    console.log('createAnswer() success in promise');
    await peerConnection.setLocalDescription(sessionDescription);
    console.log('setLocalDescription() success in promise');
    sendSdp(peerConnection.localDescription);
    drainCandidate();
  } catch (error) {
    console.error('makeAnswer() ERROR:', error);
  }
}

// offer sdp を生成する
function setOffer(sessionDescription) {
  if (peerConnection != null) {
    console.error('peerConnection already exists!');
  }
  peerConnection.onnegotiationneeded = async function () {
    try{
      await peerConnection.setRemoteDescription(sessionDescription);
      console.log('setRemoteDescription(offer) success in promise');
      makeAnswer();
    }catch(error) {
      console.error('setRemoteDescription(offer) ERROR: ', error);
    }
  }
}

async function setAnswer(sessionDescription) {
  if (!peerConnection) {
    console.error('peerConnection DOES NOT exist!');
    return;
  }
  try {
    await peerConnection.setRemoteDescription(sessionDescription);
    console.log('setRemoteDescription(answer) success in promise');
    drainCandidate();
  } catch(error) {
    console.error('setRemoteDescription(answer) ERROR: ', error);
  }
}


function sendDataChannel() {
  let textData = dataTextInput.value;
  if (textData.length == 0) {
    return;
  }
  if (dataChannel == null || dataChannel.readyState != "open") {
    return;
  }
  dataChannel.send(new TextEncoder().encode(textData));
  dataTextInput.value = "";
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
  console.log('register JSON=' + message);
  ws.send(message);
}

async function doSendPong() {
  let json = {type: 'pong'};
  const message = JSON.stringify(json);
  ws.send(message);  
}


