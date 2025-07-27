// Load environment variables
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from current directory (no path module needed)
app.use(express.static('.'));

// MongoDB connection using environment variable
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is not set');
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((error) => console.error('❌ MongoDB connection error:', error));

// Patient Schema
const patientSchema = new mongoose.Schema({
    name: { type: String, required: true },
    age: { type: String, required: true },
    sex: { type: String, required: true },
    occupation: { type: String, default: '' },
    tel: { type: String, required: true },
    familyGroup: { type: String, required: true },
    service: { type: String, required: true },
    registrationDate: { type: String, required: true },
    registrationTime: { type: String, default: '' },
    status: { type: String, default: 'registered' },
    diagnosis: { type: String, default: '' },
    labTests: [String],
    treatmentPlan: { type: String, default: '' },
    completionDate: { type: String, default: '' },
    completionTime: { type: String, default: '' }
}, { 
    timestamps: true 
});

const Patient = mongoose.model('Patient', patientSchema);

// ===== ESSENTIAL API ENDPOINTS =====

// 1. Health Check
app.get('/api/health', (req, res) => {
    console.log('💓 Health check');
    res.json({ 
        status: 'OK',
        timestamp: new Date().toISOString(),
        mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        environment: process.env.NODE_ENV || 'development'
    });
});

// 2. Get All Patients
app.get('/api/patients', async (req, res) => {
    try {
        console.log('📋 Getting all patients');
        const patients = await Patient.find().sort({ createdAt: -1 });
        console.log(`Found ${patients.length} patients`);
        res.json(patients);
    } catch (error) {
        console.error('Error getting patients:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Create New Patient
app.post('/api/patients', async (req, res) => {
    try {
        console.log('➕ Creating patient:', req.body.name);
        
        // Check for duplicate phone number
        const existingPatient = await Patient.findOne({ tel: req.body.tel });
        if (existingPatient) {
            return res.status(400).json({ error: 'Patient with this phone number already exists' });
        }

        const patientData = {
            ...req.body,
            registrationDate: new Date().toLocaleDateString(),
            registrationTime: new Date().toLocaleTimeString(),
            status: 'registered'
        };

        const patient = new Patient(patientData);
        await patient.save();
        
        console.log('✅ Patient created:', patient.name);
        res.status(201).json(patient);
    } catch (error) {
        console.error('Error creating patient:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Update Patient (Complete Record)
app.put('/api/patients', async (req, res) => {
    try {
        const { id, ...updateData } = req.body;
        console.log('✏️ Updating patient ID:', id);
        
        if (!id) {
            return res.status(400).json({ error: 'Patient ID is required' });
        }

        // Add completion timestamp if completing
        if (updateData.status === 'completed') {
            updateData.completionDate = new Date().toLocaleDateString();
            updateData.completionTime = new Date().toLocaleTimeString();
        }

        const patient = await Patient.findByIdAndUpdate(id, updateData, { new: true });
        
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        console.log('✅ Patient updated:', patient.name);
        res.json(patient);
    } catch (error) {
        console.error('Error updating patient:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Get Single Patient
app.post('/api/patient', async (req, res) => {
    try {
        const { id } = req.body;
        console.log('👤 Getting patient ID:', id);
        
        if (!id) {
            return res.status(400).json({ error: 'Patient ID is required' });
        }

        const patient = await Patient.findById(id);
        
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        res.json(patient);
    } catch (error) {
        console.error('Error getting patient:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Get Statistics
app.get('/api/stats', async (req, res) => {
    try {
        console.log('📊 Getting statistics');
        
        const totalPatients = await Patient.countDocuments();
        const pendingTests = await Patient.countDocuments({ status: 'registered' });
        const completedRecords = await Patient.countDocuments({ status: 'completed' });
        const completionRate = totalPatients > 0 ? Math.round((completedRecords / totalPatients) * 100) : 0;

        const stats = {
            totalPatients,
            pendingTests,
            completedRecords,
            completionRate
        };

        console.log('✅ Statistics:', stats);
        res.json(stats);
    } catch (error) {
        console.error('Error getting statistics:', error);
        res.status(500).json({ error: error.message });
    }
});

// 7. Search Patients
app.post('/api/search', async (req, res) => {
    try {
        const { query } = req.body;
        console.log('🔍 Searching for:', query);
        
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const patients = await Patient.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { tel: { $regex: query, $options: 'i' } }
            ]
        }).sort({ createdAt: -1 });
        
        console.log(`Found ${patients.length} patients for "${query}"`);
        res.json(patients);
    } catch (error) {
        console.error('Error searching patients:', error);
        res.status(500).json({ error: error.message });
    }
});

// 8. Delete Patient (if needed)
app.post('/api/delete', async (req, res) => {
    try {
        const { id } = req.body;
        console.log('🗑️ Deleting patient ID:', id);
        
        if (!id) {
            return res.status(400).json({ error: 'Patient ID is required' });
        }

        const patient = await Patient.findByIdAndDelete(id);
        
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        console.log('✅ Patient deleted:', patient.name);
        res.json({ message: 'Patient deleted successfully' });
    } catch (error) {
        console.error('Error deleting patient:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== SERVE MAIN PAGE =====
app.get('/', (req, res) => {
    console.log('🏠 Serving main page');
    res.sendFile(__dirname + '/index.html');
});

// ===== ERROR HANDLERS =====
app.use((req, res) => {
    console.log('❌ Route not found:', req.url);
    res.status(404).json({ error: 'Route not found' });
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log('🚀 ================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🚀 Visit: http://localhost:${PORT}`);
    console.log(`🚀 Health: http://localhost:${PORT}/api/health`);
    console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('🚀 ================================');
});

module.exports = app;