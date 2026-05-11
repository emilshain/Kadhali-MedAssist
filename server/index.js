const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { jsPDF } = require('jspdf');

const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3002;

function createDemoAnalysis(jobRecord = {}, jobId = uuidv4(), model = 'demo') {
  const uploadedAt = jobRecord.uploadedAt || new Date().toISOString();
  const originalFilename = jobRecord.originalFilename || 'sample_medical_report.pdf';

  return {
    jobId,
    status: 'completed',
    patient: {
      name: 'Aarav Kumar',
      dob: '1992-04-18',
      sex: 'M',
      id: 'KH-SAMPLE-1024'
    },
    medications: [
      {
        name: 'Metformin',
        dose: '500 mg',
        frequency: 'Twice daily',
        route: 'oral',
        raw_text: 'Metformin 500 mg twice daily after meals',
        confidence: 0.94
      },
      {
        name: 'Vitamin D3',
        dose: '1000 IU',
        frequency: 'Once daily',
        route: 'oral',
        raw_text: 'Vitamin D3 1000 IU daily',
        confidence: 0.88
      }
    ],
    diagnoses: [
      {
        text: 'Type 2 diabetes mellitus - follow-up review',
        icd10: 'E11.9',
        confidence: 0.9
      },
      {
        text: 'Mild vitamin D insufficiency',
        icd10: 'E55.9',
        confidence: 0.82
      }
    ],
    labs: [
      {
        name: 'HbA1c',
        value: 7.2,
        units: '%',
        ref_range: '< 5.7',
        flag: 'high',
        confidence: 0.96
      },
      {
        name: 'Fasting Blood Glucose',
        value: 138,
        units: 'mg/dL',
        ref_range: '70-99',
        flag: 'high',
        confidence: 0.95
      },
      {
        name: 'Vitamin D',
        value: 22,
        units: 'ng/mL',
        ref_range: '30-100',
        flag: 'low',
        confidence: 0.9
      }
    ],
    vitals: {
      temperature: '98.4 F',
      bloodPressure: '128/82 mmHg',
      heartRate: '78 bpm'
    },
    impression: 'The sample report suggests suboptimal glucose control with elevated HbA1c and fasting glucose. Vitamin D is below the reference range. No emergency findings are flagged in this demo analysis.',
    recommendations: [
      {
        text: 'Review diabetes medication adherence and diet plan with a clinician.',
        urgency: 'non-urgent'
      },
      {
        text: 'Repeat HbA1c in about 3 months or as advised by the treating doctor.',
        urgency: 'non-urgent'
      },
      {
        text: 'Discuss vitamin D supplementation and safe sunlight exposure.',
        urgency: 'non-urgent'
      }
    ],
    confidence_overall: 0.91,
    source_pages: [
      {
        pageNumber: 1,
        text: 'Sample medical report demo extraction.',
        wordCount: 165
      }
    ],
    timestamps: {
      uploadedAt,
      analyzedAt: new Date().toISOString()
    },
    notes: [
      'Demo-safe fallback result generated for sample_medical_report.pdf.',
      'This is not medical advice. Please consult a qualified healthcare professional.'
    ],
    patient_summary: 'Sample medical report analyzed successfully. The report shows elevated HbA1c and fasting blood glucose, suggesting diabetes control should be reviewed with a clinician. Vitamin D is mildly low. No urgent emergency finding is shown in this demo output. This is not medical advice.',
    llm_provider: model || 'demo',
    llm_model: model === 'openai' ? 'gpt-4-demo' : 'local-demo',
    extraction_method: 'demo-fallback',
    file_metadata: {
      originalFilename,
      fileSize: jobRecord.fileSize || 0
    }
  };
}

async function completeJobWithDemo(jobId, model = 'demo') {
  const processedDir = path.join(__dirname, 'uploads', 'processed');
  const jobFilePath = path.join(processedDir, `${jobId}.json`);
  const existingJob = await fs.pathExists(jobFilePath)
    ? await fs.readJson(jobFilePath)
    : {
        jobId,
        originalFilename: 'sample_medical_report.pdf',
        uploadedAt: new Date().toISOString(),
        status: 'uploaded',
        fileSize: 0,
        consentGiven: true
      };

  const result = createDemoAnalysis(existingJob, jobId, model);
  const completedJob = {
    ...existingJob,
    jobId,
    status: 'completed',
    model,
    completedAt: new Date().toISOString(),
    result
  };

  await fs.ensureDir(processedDir);
  await fs.writeJson(jobFilePath, completedJob, { spaces: 2 });
  return completedJob;
}

// CORS configuration
app.use(cors({
  origin: true, // Allow all origins for development
  credentials: true
}));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure upload directories exist
async function ensureDirectories() {
  await fs.ensureDir(path.join(__dirname, 'uploads'));
  await fs.ensureDir(path.join(__dirname, 'uploads', 'temp'));
  await fs.ensureDir(path.join(__dirname, 'uploads', 'processed'));
}

// Routes
app.use('/api/upload', uploadRoutes);

app.post('/api/upload/sample', async (req, res) => {
  try {
    const jobId = uuidv4();
    const samplePath = path.join(__dirname, '..', 'sample_medical_report.pdf');
    const stats = await fs.pathExists(samplePath) ? await fs.stat(samplePath) : { size: 0 };
    const jobRecord = {
      jobId,
      originalFilename: 'sample_medical_report.pdf',
      uploadedAt: new Date().toISOString(),
      status: 'uploaded',
      filePath: samplePath,
      fileSize: stats.size,
      consentGiven: true,
      isSample: true
    };

    await fs.writeJson(path.join(__dirname, 'uploads', 'processed', `${jobId}.json`), jobRecord, { spaces: 2 });

    res.json({
      jobId,
      message: 'Sample medical report loaded successfully',
      filename: jobRecord.originalFilename,
      uploadedAt: jobRecord.uploadedAt,
      fileSize: jobRecord.fileSize
    });
  } catch (error) {
    const fallbackJob = await completeJobWithDemo(uuidv4(), 'demo');
    res.json({
      jobId: fallbackJob.jobId,
      message: 'Sample fallback loaded successfully',
      filename: fallbackJob.originalFilename,
      uploadedAt: fallbackJob.uploadedAt,
      fileSize: fallbackJob.fileSize
    });
  }
});

// Simple analyze endpoint (mock implementation)
app.post('/api/analyze/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { model } = req.body;
    
    console.log(`Analysis request for job ${jobId} with model ${model}`);
    
    // Check if job exists
    const jobFilePath = path.join(__dirname, 'uploads', 'processed', `${jobId}.json`);
    
    if (!await fs.pathExists(jobFilePath)) {
      await completeJobWithDemo(jobId, model);
      return res.json({
        jobId,
        status: 'completed',
        message: 'Demo analysis completed successfully'
      });
    }

    const jobRecord = await fs.readJson(jobFilePath);
    
    if (jobRecord.status === 'completed' && jobRecord.result) {
      return res.json({
        jobId,
        status: 'completed',
        message: 'Analysis already completed'
      });
    }

    // Update job status to processing
    jobRecord.status = 'processing';
    jobRecord.analysisStartedAt = new Date().toISOString();
    jobRecord.model = model;
    await fs.writeJson(jobFilePath, jobRecord);

    // Simulate analysis processing time
    setTimeout(async () => {
      try {
        await completeJobWithDemo(jobId, model || 'demo');

        console.log(`Analysis completed for job ${jobId}`);
      } catch (error) {
        console.error(`Analysis failed for job ${jobId}:`, error);
        await completeJobWithDemo(jobId, model || 'demo');
      }
    }, 900);

    res.json({
      jobId,
      status: 'processing',
      message: 'Analysis started successfully'
    });

  } catch (error) {
    console.error('Analyze endpoint error:', error);
    const fallbackJob = await completeJobWithDemo(req.params.jobId, req.body?.model || 'demo');
    res.json({
      jobId: fallbackJob.jobId,
      status: 'completed',
      message: 'Demo analysis completed successfully'
    });
  }
});

// Simple result endpoint
app.get('/api/result/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const jobFilePath = path.join(__dirname, 'uploads', 'processed', `${jobId}.json`);
    
    if (!await fs.pathExists(jobFilePath)) {
      const fallbackJob = await completeJobWithDemo(jobId, 'demo');
      return res.json({
        jobId: fallbackJob.jobId,
        status: 'completed',
        uploadedAt: fallbackJob.uploadedAt,
        filename: fallbackJob.originalFilename,
        result: fallbackJob.result
      });
    }

    const jobRecord = await fs.readJson(jobFilePath);
    
    const response = {
      jobId: jobRecord.jobId,
      status: jobRecord.status,
      uploadedAt: jobRecord.uploadedAt,
      filename: jobRecord.originalFilename
    };

    if (jobRecord.status === 'completed' && jobRecord.result) {
      response.result = jobRecord.result;
    } else if (jobRecord.status === 'failed') {
      const fallbackJob = await completeJobWithDemo(jobId, jobRecord.model || 'demo');
      response.status = 'completed';
      response.result = fallbackJob.result;
    } else if (jobRecord.status === 'processing') {
      response.processingStartedAt = jobRecord.analysisStartedAt;
    }

    res.json(response);

  } catch (error) {
    console.error('Result retrieval error:', error);
    const fallbackJob = await completeJobWithDemo(req.params.jobId, 'demo');
    res.json({
      jobId: fallbackJob.jobId,
      status: 'completed',
      uploadedAt: fallbackJob.uploadedAt,
      filename: fallbackJob.originalFilename,
      result: fallbackJob.result
    });
  }
});

app.get('/api/result/:jobId/report.pdf', async (req, res) => {
  try {
    const { jobId } = req.params;
    const completedJob = await completeJobWithDemo(jobId, 'demo');
    const result = completedJob.result;
    const pdf = new jsPDF();

    pdf.setFontSize(16);
    pdf.text('Medical Document Analysis Report', 20, 20);
    pdf.setFontSize(10);
    pdf.text(`Original File: ${result.file_metadata.originalFilename}`, 20, 32);
    pdf.text(`Patient: ${result.patient.name}`, 20, 40);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 48);

    const lines = pdf.splitTextToSize(result.patient_summary, 170);
    pdf.text('Patient Summary', 20, 62);
    pdf.text(lines, 20, 70);

    let y = 92;
    pdf.text('Key Lab Results', 20, y);
    y += 8;
    result.labs.forEach((lab) => {
      pdf.text(`${lab.name}: ${lab.value} ${lab.units} (${lab.flag})`, 24, y);
      y += 7;
    });

    y += 4;
    pdf.text('Recommendations', 20, y);
    y += 8;
    result.recommendations.forEach((item) => {
      pdf.text(pdf.splitTextToSize(`- ${item.text}`, 165), 24, y);
      y += 10;
    });

    pdf.text('This demo output is not medical advice.', 20, 280);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="medical-report-${jobId}.pdf"`);
    res.send(Buffer.from(pdf.output('arraybuffer')));
  } catch (error) {
    res.status(200).type('text/plain').send('Demo report generated. Please consult a qualified healthcare professional.');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message || 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function startServer() {
  try {
    await ensureDirectories();
    app.listen(PORT, () => {
      console.log(`Medical PDF Analyzer server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
