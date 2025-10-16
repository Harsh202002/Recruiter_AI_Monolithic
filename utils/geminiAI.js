const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateJobDescription = async (jobInfo) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Using gemini-pro instead of 2.5-flash

    const prompt = `Create a professional job description in JSON format for ${jobInfo.companyName}.
    
    Use this exact JSON structure without any markdown formatting or code blocks:
    {
      "description": "write company overview and role summary here",
      "responsibilities": ["responsibility 1", "responsibility 2"],
      "qualifications": ["qualification 1", "qualification 2"],
      "requiredSkills": ["skill 1", "skill 2"],
      "niceToHaveSkills": ["nice skill 1", "nice skill 2"],
      "benefits": ["benefit 1", "benefit 2"]
    }

    Use these details to generate the content:
    - Title: ${jobInfo.title}
    - Required Experience: ${jobInfo.experience} years
    - Required Skills: ${jobInfo.requiredSkills}
    - Location: ${jobInfo.location}
    - Employment Type: ${jobInfo.employmentType}
    - Job Type: ${jobInfo.jobType}
    - Salary Range: ${jobInfo.salaryRange}
    - Industry: ${jobInfo.industry}
    - Company Size: ${jobInfo.companySize}
    
    Additional Context:
    ${jobInfo.businessContext}

    Remember: Return ONLY valid JSON without any additional text, markdown, or code blocks.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean up the response to ensure valid JSON
    const cleanedResponse = text.replace(/```json|```/g, '').trim();
    
    try {
      // Attempt to parse the JSON
      const parsedJson = JSON.parse(cleanedResponse);
      return JSON.stringify(parsedJson);
    } catch (parseError) {
      // Fallback default structure if parsing fails
      console.error('JSON parsing failed:', parseError);
      return JSON.stringify({
        description: "A compelling opportunity at " + jobInfo.companyName,
        responsibilities: ["Role responsibilities will be detailed here"],
        qualifications: ["Required qualifications will be listed here"],
        requiredSkills: jobInfo.requiredSkills.split(',').map(skill => skill.trim()),
        niceToHaveSkills: ["Additional skills welcome"],
        benefits: ["Competitive benefits package"]
      });
    }
  } catch (error) {
    console.error('Gemini AI Error:', error);
    throw new Error('Failed to generate job description');
  }
};

module.exports = { generateJobDescription };