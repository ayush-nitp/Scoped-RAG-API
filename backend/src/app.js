const express = require('express');
const cors = require('cors');
const ApiResponse = require('./utils/ApiResponse');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/status', (req, res) => {
    res.status(200).json(new ApiResponse(200, null, "Backend server is running perfectly!"));
});

// Import and mount the document routes
const documentRoutes = require('./routes/document.routes');
app.use('/api', documentRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[ERROR] ${statusCode}: ${message}`);
    
    res.status(statusCode).json({
        success: false,
        message: message,
        errors: err.errors || []
    });
});

module.exports = app;