const express = require('express');
const router = express.Router();
const upload = require('../middlewares/multer.middleware');
const { uploadDocument, askQuestion } = require('../controllers/document.controller');

// Maps to POST /api/upload
router.post('/upload', upload.single('pdfDocument'), uploadDocument);

// Maps to POST /api/ask
router.post('/ask', askQuestion);

module.exports = router;