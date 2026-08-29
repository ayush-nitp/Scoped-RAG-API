const fs = require('fs');
const pdfExtraction = require('pdf-extraction');
const { Pinecone } = require('@pinecone-database/pinecone');
const { PineconeStore } = require('@langchain/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const chunkTextSemantically = require('../utils/semanticChunker');

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// ASYNCHRONOUS UPLOAD PIPELINE (3072-dim Gemini Embeddings)
// ==========================================
const uploadDocument = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, "No file uploaded. Please attach a PDF.");
    }

    // Yahan humne file ka original naam utha liya hai (e.g. "reliance_internship.pdf")
    const originalFilename = req.file.originalname;
    console.log(`\n--- NEW UPLOAD: ${originalFilename} ---`);
    const filePath = req.file.path;

    res.status(202).json(
        new ApiResponse(202, null, `Document '${originalFilename}' accepted. 3072-dim vectorization started.`)
    );

    setImmediate(async () => {
        try {
            console.log("⏳ [Background Worker] Starting PDF extraction...");
            const dataBuffer = fs.readFileSync(filePath);
            
            const extractedData = await pdfExtraction(dataBuffer);

            // 🚨 THE SAFETY CHECK (Smart Validation)
            const cleanText = extractedData.text.trim();
            if (cleanText.length < 50) {
                console.error("❌ [Background Worker] PDF text layer is corrupted or image-based.");
                // Yahan background worker ruk jayega aur empty chunks DB mein nahi jayenge
                return; 
            }

            const chunks = chunkTextSemantically(cleanText);
            console.log(`⏳ [Background Worker] Generated ${chunks.length} clean semantic chunks.`);

            // 🚨 GEMINI OFFICIAL 3072-DIM EMBEDDER
            const customEmbeddings = {
                embedQuery: async (text) => {
                    const model = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
                    const result = await model.embedContent(text);
                    return result.embedding.values;
                },
                embedDocuments: async (texts) => {
                    console.log(`⏳ [Background Worker] Generating 3072-dim Gemini embeddings for ${texts.length} chunks...`);
                    const model = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
                    
                    const embeddings = [];
                    for (const text of texts) {
                        const result = await model.embedContent(text);
                        embeddings.push(result.embedding.values);
                    }
                    console.log("✅ 3072-dim Embeddings generated successfully!");
                    return embeddings;
                }
            };

            const pineconeIndex = pc.index("rag-project"); // Ensure this index is set to 3072 dimensions in Pinecone!
            
            // 🚨 METADATA UPDATE: Har chunk (Document) ke metadata me filename add kar do
            const chunksWithMetadata = chunks.map(chunk => {
                return {
                    pageContent: chunk.pageContent || chunk, // Ensure content is mapped correctly
                    metadata: {
                        ...(chunk.metadata || {}), // Purana metadata bacha lo
                        filename: originalFilename // Naya name tag laga do
                    }
                };
            });
            
            // Wapas humara bharosemand `fromDocuments` use kar rahe hain
            await PineconeStore.fromDocuments(chunksWithMetadata, customEmbeddings, { pineconeIndex });
            
            console.log(`✅ [Background Worker] Successfully pushed '${originalFilename}' to Pinecone!`);
        } catch (error) {
            console.error("❌ [Background Worker] Processing Failed:", error);
        } finally {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log("🧹 [Background Worker] Local PDF file cleaned up.");
            }
        }
    });
});

// ==========================================
// ASK QUESTION PIPELINE (Gemini Embeddings + Gemini 3.6 Flash Generation + With Target PDF Filter)
// ==========================================
const askQuestion = asyncHandler(async (req, res) => {
    const { question, filename } = req.body;
    if (!question) {
        throw new ApiError(400, "Please provide a question.");
    }

    console.log(`\n--- NEW QUESTION: "${question}" ---`);
    
    // 1. Vectorize Question using Gemini 768-dim model
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
    const queryResult = await embeddingModel.embedContent(question);
    const questionVector = queryResult.embedding.values;

    // 2. Retrieve from Pinecone
    const pineconeIndex = pc.index("rag-project");
    
    // 🚨 FILTER LOGIC: Agar user ne filename diya hai, toh filter lagao, warna pure DB me dhundo
    const queryParams = {
        vector: questionVector,
        topK: 10,
        includeMetadata: true 
    };

    if (filename) {
        queryParams.filter = { filename: filename };
    }

    const searchResults = await pineconeIndex.query(queryParams);

    // 3. Hallucination Killer: Professional Threshold (>= 0.70 for Gemini Embeddings)
    let context = "";
    if (searchResults.matches) {
        searchResults.matches.forEach(match => {
            console.log(`[Score Check] Score: ${match.score.toFixed(3)} | File: ${match.metadata.filename || 'Unknown'} | Text: "${match.metadata.text.substring(0, 30)}..."`);
            
            // Threshold sweet spot wahi hai (0.60)
            if(match.score >= 0.60 && match.metadata && match.metadata.text) {
                context += match.metadata.text + "\n";
            }
        });
    }

    const cleanContext = context.trim();

    if (!cleanContext) {
        return res.status(200).json(
            new ApiResponse(200, { answer: "Based on the provided document, I could not find relevant information to answer your question." })
        );
    }

    // 4. Gemini 3.6 Flash Generation
    console.log("Generating response using Gemini 3.6 Flash...");
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const prompt = `You are a highly accurate document analysis assistant. 
Use ONLY the provided context to answer the user's question. 
If the exact answer is not contained within the context, politely state that the document does not contain this information. 
Do not use outside knowledge. Do not format your response as JSON. Use clear, readable plain text or markdown.

[CONTEXT START]
${cleanContext}
[CONTEXT END]

[QUESTION]
${question}`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    console.log("✅ Gemini Generation Successful!");
    res.status(200).json(new ApiResponse(200, { answer }, "Answer generated successfully"));
});

module.exports = { uploadDocument, askQuestion };