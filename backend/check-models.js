const https = require('https');
require('dotenv').config();

console.log("Checking Google's servers for allowed EMBEDDING models...\n");

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;

https.get(url, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            
            if (response.error) {
                console.log("❌ API Error:", response.error.message);
                return;
            }
            
            let found = false;
            console.log("✅ Tumhari key ke liye allowed Embedding Models:");
            
            response.models.forEach(model => {
                // Ab hum embedContent check kar rahe hain
                if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes("embedContent")) {
                    console.log(`👉 ${model.name.replace('models/', '')}`);
                    found = true;
                }
            });
            
            if (!found) {
                console.log("❌ Koi embedding model active nahi mila.");
            }
        } catch (e) {
            console.log("Data padhne mein error:", e.message);
        }
    });
}).on('error', (err) => {
    console.log("❌ Network Error:", err.message);
});