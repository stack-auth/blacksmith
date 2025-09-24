require('dotenv').config({ path: '.env.local' });
const OpenAI = require('openai');
const logger = require('./logger');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function algo(language, englishString, oldLanguageString) {
    logger.debug(`Processing ${language} - English: ${englishString.length} chars, Old: ${oldLanguageString.length} chars`);

    // Parse the file structure from the concatenated strings
    const englishFiles = parseFileStructure(englishString);
    const oldLanguageFiles = parseFileStructure(oldLanguageString);

    // Create the prompt for GPT-5
    const prompt = `
Task: Update ${language} code files to match the English specification.

Instructions:
1. Analyze the English language specification files below
2. Update the existing ${language} code to implement the English spec
3. Keep changes minimal - preserve existing code style and structure
4. Output ONLY a valid JSON object with filename keys and file content values
5. Do not include any explanation, markdown, or extra text

English Specification Files:
${JSON.stringify(englishFiles, null, 2)}

Current ${language} Implementation Files:
${JSON.stringify(oldLanguageFiles, null, 2)}

Output format (MUST be valid JSON):
{
  "filename1.${getFileExtension(language)}": "file content here",
  "filename2.${getFileExtension(language)}": "another file content"
}
`.trim();

    try {
        logger.debug(`Calling GPT-5 for ${language}...`);

        const result = await openai.responses.create({
            model: "gpt-5",
            input: prompt,
            reasoning: { effort: "medium" },
            text: { verbosity: "low" }
        });

        const outputText = result.output_text;

        // Validate and parse the response
        let parsedOutput;
        try {
            // Clean the output in case there's any extra whitespace
            const cleanedOutput = outputText.trim();

            // Try to extract JSON if it's wrapped in markdown code blocks
            const jsonMatch = cleanedOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : cleanedOutput;

            parsedOutput = JSON.parse(jsonString);
        } catch (parseError) {
            logger.error(`Failed to parse GPT-5 response for ${language}:`, parseError.message);
            logger.debug('Raw response:', outputText);

            // Fallback: return example files if parsing fails
            return {
                'error.txt': `Failed to parse GPT-5 response: ${parseError.message}`,
                'raw_response.txt': outputText
            };
        }

        // Validate the output structure
        if (!isValidFileStructure(parsedOutput)) {
            logger.warning(`Invalid file structure returned for ${language}`);
            return {
                'error.txt': 'Invalid file structure returned by GPT-5',
                'raw_response.txt': JSON.stringify(parsedOutput, null, 2)
            };
        }

        logger.success(`GPT-5 successfully processed ${language}`);
        return parsedOutput;

    } catch (error) {
        logger.error(`Error calling GPT-5 for ${language}:`, error.message);

        // Return error files for debugging
        return {
            'error.txt': `Error calling GPT-5: ${error.message}`,
            'fallback.txt': `Fallback content for ${language}`
        };
    }
}

// Helper function to parse concatenated file strings back into objects
function parseFileStructure(concatenatedString) {
    const files = {};

    if (!concatenatedString) return files;

    // Split by file separator pattern
    const fileBlocks = concatenatedString.split(/=== (.*?) ===/);

    for (let i = 1; i < fileBlocks.length; i += 2) {
        const filename = fileBlocks[i].trim();
        const content = fileBlocks[i + 1] ? fileBlocks[i + 1].trim() : '';
        files[filename] = content;
    }

    return files;
}

// Helper function to get appropriate file extension for language
function getFileExtension(language) {
    const extensions = {
        javascript: 'js',
        python: 'py',
        java: 'java',
        csharp: 'cs',
        cpp: 'cpp',
        ruby: 'rb',
        go: 'go',
        rust: 'rs',
        swift: 'swift',
        kotlin: 'kt'
    };

    return extensions[language] || 'txt';
}

// Validate that the output is a valid file structure
function isValidFileStructure(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    // Check that all keys are strings (filenames) and all values are strings (content)
    for (const [key, value] of Object.entries(obj)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
            return false;
        }

        // Basic filename validation
        if (!key || key.includes('\0') || key.includes('/')) {
            return false;
        }
    }

    // Must have at least one file
    return Object.keys(obj).length > 0;
}

module.exports = { algo };