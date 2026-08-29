const chunkTextSemantically = (rawText) => {
    // 1. Clean the PDF artifacts
    const cleanText = rawText
        .replace(/([^\n])\n([^\n])/g, '$1 $2') 
        .replace(/\s+/g, ' ') 
        .trim();

    // 2. Split into perfect sentences based on punctuation
    const sentences = cleanText.split(/(?<=[.!?])\s+/);
    
    const chunks = [];
    let currentChunk = "";

    for (let sentence of sentences) {
        let s = sentence.trim();
        if (!s) continue;
        
        // Group sentences up to ~800 characters for optimal Pinecone retrieval
        if (currentChunk.length + s.length > 800 && currentChunk.length > 0) {
            chunks.push({ pageContent: currentChunk.trim(), metadata: {} });
            currentChunk = s;
        } else {
            currentChunk = currentChunk ? currentChunk + " " + s : s;
        }
    }
    
    // Push the final remaining chunk
    if (currentChunk.trim().length > 0) {
        chunks.push({ pageContent: currentChunk.trim(), metadata: {} });
    }

    return chunks;
};

module.exports = chunkTextSemantically;