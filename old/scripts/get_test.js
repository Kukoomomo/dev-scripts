const axios = require('axios');

const proofApiUrl = 'http://localhost:8080/getProof';
const indexApiUrl = 'http://localhost:8080/getIndex';
const index = 0;

var l1Address = '0x79E41C81506a34a5962b10825171132E566476D5'
var l2Address = '0x59A16201e6b175Da0f4C71F7EbCd265cbD50a58a'

var addTokenPairUrl = `http://localhost:8080/addToList?l1Address=${l1Address}&l2Address=${l2Address}`;

axios.get(proofApiUrl, {
    params: {
        nonce: index
    }
})
    .then(response => {
        console.log('leaf', response.data.leaf);
        let str = ''
        for (var i in response.data.proof) {  //遍历数组
            str = str + ' ' + response.data.proof[i]
        }
        console.log('proof', str)
        console.log('root', response.data.root);
        console.log('index', response.data.index);
    })
    .catch(error => {
        console.error(error);
    });

axios.get(indexApiUrl, {})
    .then(response => {
        console.log('index', response.data);
    })
    .catch(error => {
        console.error(error);
    });

axios.get(addTokenPairUrl, {
    params: {
        l1Address: l1Address,
        l2Address: l2Address
    }
})
    .then(response => {
        console.log(response.data)
    })
    .catch(error => {
        console.log(error);
    });