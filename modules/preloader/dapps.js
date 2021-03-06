/**
@module preloader dapps
*/

const ipc = require('ipc');
const mist = require('../mistAPI.js');
const shell = require('shell');
const web3 = require('web3');
const BigNumber = require('bignumber.js');
const ipcProviderWrapper = require('../ipc/ipcProviderWrapper.js');
require('../loadFavicon.js');


// notifiy the tab to store the webview id
ipc.sendToHost('setWebviewId');

// SET WEB3 PROVIDOR
// destroy the old socket
ipc.send('ipcProvider-destroy');


// create a new one
web3.setProvider(new web3.providers.IpcProvider('', ipcProviderWrapper));

// web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

// var remote = require('remote');
// web3.setProvider(new web3.providers.IpcProvider('/Users/frozeman/Library/Ethereum/geth.ipc', remote.require('net')));


// open a[target="_blank"] in external browser
document.addEventListener('click', function(e) {
    if(e.target.nodeName === 'A' && e.target.attributes.target && e.target.attributes.target.value === "_blank") {
        e.preventDefault();
        shell.openExternal(e.target.href);
    }
}, false);



window.mist = mist;
window.BigNumber = BigNumber;
window.web3 = web3;