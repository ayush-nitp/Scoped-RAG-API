require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 5000;

// Note: If you had a MongoDB connection, it would go here before app.listen.
// Since Pinecone handles connections per request/instance, we can just start the server.

app.listen(PORT, () => {
    console.log(`⚙️  Server is running on port: ${PORT}`);
});