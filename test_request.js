const axios = require('axios');
(async () => {
    try {
        const res = await axios.get('http://localhost:3001/api/orders?statusMode=unfulfilled');
        console.log("Success:", Object.keys(res.data));
    } catch(e) {
        console.error("Error from Server:", e.response ? e.response.data : e.message);
    }
})();
