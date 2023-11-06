const axios = require('axios');

const proofApiUrl = 'http://localhost:8080/getProof';
const indexApiUrl = 'http://localhost:8080/getIndex';
const index = 0;
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