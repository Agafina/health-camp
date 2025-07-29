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

// Enhanced Patient Schema with validation
const patientSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Patient name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters long'],
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    age: { 
        type: String, 
        required: [true, 'Patient age is required'],
        validate: {
            validator: function(v) {
                return /^\d+$/.test(v) && parseInt(v) >= 0 && parseInt(v) <= 150;
            },
            message: 'Age must be a valid number between 0 and 150'
        }
    },
    sex: { 
        type: String, 
        required: [true, 'Patient sex is required'],
        enum: {
            values: ['Male', 'Female'],
            message: 'Sex must be either Male or Female'
        }
    },
    occupation: { 
        type: String, 
        default: '',
        trim: true,
        maxlength: [100, 'Occupation cannot exceed 100 characters']
    },
    tel: { 
        type: String, 
        required: [true, 'Phone number is required'],
        trim: true,
        validate: {
            validator: function(v) {
                return /^[\d\-\+\(\)\s]+$/.test(v) && v.replace(/\D/g, '').length >= 8;
            },
            message: 'Please enter a valid phone number with at least 8 digits'
        }
    },
    familyGroup: { 
        type: String, 
        required: [true, 'Family group is required'],
        enum: {
            values: ['ESDA', 'MASUDA', 'AKUCDA', 'UBACDA', 'OTHERS'],
            message: 'Family group must be one of: ESDA, MASUDA, AKUCDA, UBACDA, OTHERS'
        }
    },
    service: { 
        type: String, 
        required: [true, 'Service is required'],
        enum: {
            values: ['General consultations', 'Eye con', 'Gynaecology', 'Cervical cancer screening'],
            message: 'Service must be one of the available options'
        }
    },
    registrationDate: { 
        type: String, 
        required: true,
        default: () => new Date().toLocaleDateString()
    },
    registrationTime: { 
        type: String, 
        default: () => new Date().toLocaleTimeString()
    },
    status: { 
        type: String, 
        default: 'registered',
        enum: {
            values: ['registered', 'completed'],
            message: 'Status must be either registered or completed'
        }
    },
    diagnosis: { 
        type: String, 
        default: '',
        trim: true,
        maxlength: [1000, 'Diagnosis cannot exceed 1000 characters']
    },
    labTests: {
        type: [String],
        default: [],
        validate: {
            validator: function(tests) {
                const validTests = [
                    'Malaria', 'HIV', 'HBV', 'HCV', 'Blood grouping', 
                    'Blood glucose', 'Syphilis', 'Ultrasound', 'X-ray',
                    'ECG', 'Urinalysis', 'Lipid Profile'
                ];
                return tests.every(test => validTests.includes(test));
            },
            message: 'Invalid lab test specified'
        }
    },
    treatmentPlan: { 
        type: String, 
        default: '',
        trim: true,
        maxlength: [2000, 'Treatment plan cannot exceed 2000 characters']
    },
    completionDate: { 
        type: String, 
        default: ''
    },
    completionTime: { 
        type: String, 
        default: ''
    },
    // Audit fields
    lastModified: {
        type: Date,
        default: Date.now
    },
    modificationHistory: [{
        action: {
            type: String,
            enum: ['created', 'updated', 'completed'],
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        changes: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    }]
}, { 
    timestamps: true 
});

// Indexes for better performance
patientSchema.index({ tel: 1 }, { unique: true });
patientSchema.index({ name: 1 });
patientSchema.index({ status: 1 });
patientSchema.index({ service: 1 });
patientSchema.index({ familyGroup: 1 });
patientSchema.index({ createdAt: -1 });

// Pre-save middleware to update lastModified
patientSchema.pre('save', function(next) {
    this.lastModified = new Date();
    next();
});

// Pre-update middleware to update lastModified
patientSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
    this.set({ lastModified: new Date() });
    next();
});

const Patient = mongoose.model('Patient', patientSchema);

// ===== UTILITY FUNCTIONS =====

// Error handler middleware
const handleError = (res, error, defaultMessage = 'An error occurred') => {
    console.error('Error:', error);
    
    if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ 
            error: 'Validation failed', 
            details: errors,
            message: errors.join(', ')
        });
    }
    
    if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(400).json({ 
            error: 'Duplicate entry', 
            message: `A patient with this ${field} already exists`
        });
    }
    
    if (error.name === 'CastError') {
        return res.status(400).json({ 
            error: 'Invalid ID format',
            message: 'The provided ID is not valid'
        });
    }
    
    res.status(500).json({ 
        error: defaultMessage,
        message: error.message || defaultMessage
    });
};

// Validation helper
const validateObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};

// Add modification history
const addModificationHistory = async (patientId, action, changes = {}) => {
    try {
        await Patient.findByIdAndUpdate(patientId, {
            $push: {
                modificationHistory: {
                    action,
                    timestamp: new Date(),
                    changes
                }
            }
        });
    } catch (error) {
        console.error('Failed to add modification history:', error);
    }
};

// ===== ESSENTIAL API ENDPOINTS =====

// 1. Health Check - Enhanced
app.get('/api/health', async (req, res) => {
    console.log('💓 Health check');
    
    try {
        // Test database connection
        await mongoose.connection.db.admin().ping();
        
        // Get basic stats
        const totalPatients = await Patient.countDocuments();
        const pendingPatients = await Patient.countDocuments({ status: 'registered' });
        const completedPatients = await Patient.countDocuments({ status: 'completed' });
        
        res.json({ 
            status: 'OK',
            timestamp: new Date().toISOString(),
            mongoStatus: 'connected',
            environment: process.env.NODE_ENV || 'development',
            stats: {
                totalPatients,
                pendingPatients,
                completedPatients
            },
            version: '2.0.0'
        });
    } catch (error) {
        handleError(res, error, 'Health check failed');
    }
});

// 2. Get All Patients - Enhanced with pagination and sorting
app.get('/api/patients', async (req, res) => {
    try {
        console.log('📋 Getting all patients');
        
        const { 
            page = 1, 
            limit = 1000, 
            sort = '-createdAt',
            status,
            service,
            familyGroup,
            search 
        } = req.query;
        
        // Build query
        let query = {};
        
        if (status) query.status = status;
        if (service) query.service = service;
        if (familyGroup) query.familyGroup = familyGroup;
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { tel: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Execute query with pagination
        const patients = await Patient.find(query)
            .sort(sort)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean(); // Use lean() for better performance
        
        const total = await Patient.countDocuments(query);
        
        console.log(`Found ${patients.length} patients (${total} total)`);
        
        res.json({
            patients,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalPatients: total,
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
        
        // For backward compatibility, if no pagination params are provided, return just the patients array
        if (!req.query.page && !req.query.limit) {
            res.json(patients);
        }
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve patients');
    }
});

// 3. Create New Patient - Enhanced with validation
app.post('/api/patients', async (req, res) => {
    try {
        console.log('➕ Creating patient:', req.body.name);
        
        // Sanitize input data
        const patientData = {
            name: req.body.name?.trim(),
            age: req.body.age?.toString().trim(),
            sex: req.body.sex,
            occupation: req.body.occupation?.trim() || '',
            tel: req.body.tel?.trim(),
            familyGroup: req.body.familyGroup,
            service: req.body.service,
            status: 'registered'
        };
        
        // Check for duplicate phone number more explicitly
        const existingPatient = await Patient.findOne({ tel: patientData.tel });
        if (existingPatient) {
            return res.status(400).json({ 
                error: 'Duplicate phone number', 
                message: `A patient with phone number ${patientData.tel} already exists` 
            });
        }
        
        const patient = new Patient(patientData);
        await patient.save();
        
        // Add creation history
        await addModificationHistory(patient._id, 'created', patientData);
        
        console.log('✅ Patient created:', patient.name);
        res.status(201).json(patient);
        
    } catch (error) {
        handleError(res, error, 'Failed to create patient');
    }
});

// 4. Update Patient - Enhanced with change tracking
app.put('/api/patients', async (req, res) => {
    try {
        const { id, ...updateData } = req.body;
        console.log('✏️ Updating patient ID:', id);
        
        if (!id) {
            return res.status(400).json({ error: 'Patient ID is required' });
        }
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ error: 'Invalid patient ID format' });
        }
        
        // Get current patient data for change tracking
        const currentPatient = await Patient.findById(id);
        if (!currentPatient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        
        // Sanitize update data
        const sanitizedData = {};
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined && updateData[key] !== null) {
                if (typeof updateData[key] === 'string') {
                    sanitizedData[key] = updateData[key].trim();
                } else {
                    sanitizedData[key] = updateData[key];
                }
            }
        });
        
        // Add completion timestamp if completing
        if (sanitizedData.status === 'completed' && currentPatient.status !== 'completed') {
            sanitizedData.completionDate = new Date().toLocaleDateString();
            sanitizedData.completionTime = new Date().toLocaleTimeString();
        }
        
        // Check for phone number duplicates if tel is being updated
        if (sanitizedData.tel && sanitizedData.tel !== currentPatient.tel) {
            const existingPatient = await Patient.findOne({ 
                tel: sanitizedData.tel,
                _id: { $ne: id }
            });
            if (existingPatient) {
                return res.status(400).json({ 
                    error: 'Duplicate phone number', 
                    message: `Another patient with phone number ${sanitizedData.tel} already exists` 
                });
            }
        }
        
        const patient = await Patient.findByIdAndUpdate(
            id, 
            sanitizedData, 
            { 
                new: true, 
                runValidators: true 
            }
        );
        
        // Track changes
        const changes = {};
        Object.keys(sanitizedData).forEach(key => {
            if (currentPatient[key] !== sanitizedData[key]) {
                changes[key] = {
                    from: currentPatient[key],
                    to: sanitizedData[key]
                };
            }
        });
        
        const action = sanitizedData.status === 'completed' ? 'completed' : 'updated';
        await addModificationHistory(patient._id, action, changes);
        
        console.log('✅ Patient updated:', patient.name);
        res.json(patient);
        
    } catch (error) {
        handleError(res, error, 'Failed to update patient');
    }
});

// 5. Get Single Patient - Enhanced
app.get('/api/patients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('👤 Getting patient ID:', id);
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ error: 'Invalid patient ID format' });
        }
        
        const patient = await Patient.findById(id);
        
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        
        res.json(patient);
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve patient');
    }
});

// 5b. Get Single Patient (POST method for backward compatibility)
app.post('/api/patient', async (req, res) => {
    try {
        const { id } = req.body;
        console.log('👤 Getting patient ID:', id);
        
        if (!id) {
            return res.status(400).json({ error: 'Patient ID is required' });
        }
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ error: 'Invalid patient ID format' });
        }
        
        const patient = await Patient.findById(id);
        
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        
        res.json(patient);
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve patient');
    }
});

// 6. Get Statistics - Enhanced
app.get('/api/stats', async (req, res) => {
    try {
        console.log('📊 Getting statistics');
        
        const [
            totalPatients,
            pendingTests,
            completedRecords,
            serviceStats,
            familyGroupStats,
            recentRegistrations
        ] = await Promise.all([
            Patient.countDocuments(),
            Patient.countDocuments({ status: 'registered' }),
            Patient.countDocuments({ status: 'completed' }),
            Patient.aggregate([
                { $group: { _id: '$service', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Patient.aggregate([
                { $group: { _id: '$familyGroup', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Patient.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            })
        ]);
        
        const completionRate = totalPatients > 0 ? Math.round((completedRecords / totalPatients) * 100) : 0;
        
        const stats = {
            totalPatients,
            pendingTests,
            completedRecords,
            completionRate,
            recentRegistrations,
            serviceDistribution: serviceStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            familyGroupDistribution: familyGroupStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {})
        };
        
        console.log('✅ Statistics:', stats);
        res.json(stats);
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve statistics');
    }
});

// 7. Search Patients - Enhanced
app.post('/api/search', async (req, res) => {
    try {
        const { query, filters = {} } = req.body;
        console.log('🔍 Searching for:', query);
        
        if (!query || query.trim().length === 0) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        
        const searchQuery = {
            $or: [
                { name: { $regex: query.trim(), $options: 'i' } },
                { tel: { $regex: query.trim().replace(/\D/g, ''), $options: 'i' } }
            ]
        };
        
        // Add filters
        if (filters.status) searchQuery.status = filters.status;
        if (filters.service) searchQuery.service = filters.service;
        if (filters.familyGroup) searchQuery.familyGroup = filters.familyGroup;
        
        const patients = await Patient.find(searchQuery)
            .sort({ createdAt: -1 })
            .limit(50); // Limit search results
        
        console.log(`Found ${patients.length} patients for "${query}"`);
        res.json(patients);
        
    } catch (error) {
        handleError(res, error, 'Search failed');
    }
});

// 8. Delete Patient - Enhanced with soft delete option
app.delete('/api/patients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { permanent = false } = req.query;
        console.log('🗑️ Deleting patient ID:', id);
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ error: 'Invalid patient ID format' });
        }
        
        const patient = await Patient.findById(id);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        
        if (permanent === 'true') {
            // Permanent deletion
            await Patient.findByIdAndDelete(id);
            console.log('✅ Patient permanently deleted:', patient.name);
            res.json({ 
                message: 'Patient permanently deleted successfully',
                deletedPatient: {
                    id: patient._id,
                    name: patient.name,
                    tel: patient.tel
                }
            });
        } else {
            // Soft delete - mark as deleted
            const deletedPatient = await Patient.findByIdAndUpdate(
                id,
                { 
                    status: 'deleted',
                    deletedAt: new Date(),
                    lastModified: new Date()
                },
                { new: true }
            );
            
            await addModificationHistory(id, 'deleted', { deletedAt: new Date() });
            
            console.log('✅ Patient soft deleted:', patient.name);
            res.json({ 
                message: 'Patient deleted successfully',
                deletedPatient: {
                    id: deletedPatient._id,
                    name: deletedPatient.name,
                    tel: deletedPatient.tel
                }
            });
        }
        
    } catch (error) {
        handleError(res, error, 'Failed to delete patient');
    }
});

// 8b. Delete Patient (POST method for backward compatibility)
app.post('/api/delete', async (req, res) => {
    try {
        const { id } = req.body;
        console.log('🗑️ Deleting patient ID:', id);
        
        if (!id) {
            return res.status(400).json({ error: 'Patient ID is required' });
        }
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ error: 'Invalid patient ID format' });
        }
        
        const patient = await Patient.findById(id);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        
        await Patient.findByIdAndDelete(id);
        
        console.log('✅ Patient deleted:', patient.name);
        res.json({ 
            message: 'Patient deleted successfully',
            deletedPatient: {
                id: patient._id,
                name: patient.name,
                tel: patient.tel
            }
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to delete patient');
    }
});

// 9. Bulk Operations
app.post('/api/patients/bulk', async (req, res) => {
    try {
        const { operation, patientIds, updateData } = req.body;
        console.log(`🔄 Bulk ${operation} for ${patientIds?.length || 0} patients`);
        
        if (!operation || !patientIds || !Array.isArray(patientIds)) {
            return res.status(400).json({ error: 'Invalid bulk operation request' });
        }
        
        // Validate all IDs
        const invalidIds = patientIds.filter(id => !validateObjectId(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({ 
                error: 'Invalid patient IDs', 
                invalidIds 
            });
        }
        
        let result;
        
        switch (operation) {
            case 'delete':
                result = await Patient.deleteMany({ _id: { $in: patientIds } });
                break;
                
            case 'update':
                if (!updateData) {
                    return res.status(400).json({ error: 'Update data is required for bulk update' });
                }
                result = await Patient.updateMany(
                    { _id: { $in: patientIds } },
                    { ...updateData, lastModified: new Date() }
                );
                break;
                
            case 'complete':
                result = await Patient.updateMany(
                    { _id: { $in: patientIds } },
                    { 
                        status: 'completed',
                        completionDate: new Date().toLocaleDateString(),
                        completionTime: new Date().toLocaleTimeString(),
                        lastModified: new Date()
                    }
                );
                break;
                
            default:
                return res.status(400).json({ error: 'Invalid operation type' });
        }
        
        console.log(`✅ Bulk ${operation} completed:`, result);
        res.json({ 
            message: `Bulk ${operation} completed successfully`,
            result,
            affectedCount: result.modifiedCount || result.deletedCount || 0
        });
        
    } catch (error) {
        handleError(res, error, 'Bulk operation failed');
    }
});

// 10. Export Data
app.get('/api/export', async (req, res) => {
    try {
        const { format = 'json', status, service, familyGroup } = req.query;
        console.log('📤 Exporting data in format:', format);
        
        // Build query
        let query = {};
        if (status) query.status = status;
        if (service) query.service = service;
        if (familyGroup) query.familyGroup = familyGroup;
        
        const patients = await Patient.find(query).sort({ createdAt: -1 });
        
        const exportData = {
            exportDate: new Date().toISOString(),
            exportedBy: 'Health Campaign System',
            totalRecords: patients.length,
            filters: { status, service, familyGroup },
            patients: patients
        };
        
        if (format === 'csv') {
            // Convert to CSV format
            const csv = convertToCSV(patients);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=patients_${Date.now()}.csv`);
            res.send(csv);
        } else {
            // Default JSON format
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=patients_${Date.now()}.json`);
            res.json(exportData);
        }
        
    } catch (error) {
        handleError(res, error, 'Export failed');
    }
});

// CSV conversion helper
function convertToCSV(patients) {
    if (!patients.length) return '';
    
    const headers = [
        'Name', 'Age', 'Sex', 'Occupation', 'Phone', 'Family Group', 
        'Service', 'Status', 'Registration Date', 'Diagnosis', 
        'Lab Tests', 'Treatment Plan', 'Completion Date'
    ];
    
    const csvContent = [
        headers.join(','),
        ...patients.map(patient => [
            `"${patient.name}"`,
            patient.age,
            patient.sex,
            `"${patient.occupation || ''}"`,
            patient.tel,
            patient.familyGroup,
            `"${patient.service}"`,
            patient.status,
            patient.registrationDate,
            `"${patient.diagnosis || ''}"`,
            `"${patient.labTests?.join('; ') || ''}"`,
            `"${patient.treatmentPlan || ''}"`,
            patient.completionDate || ''
        ].join(','))
    ].join('\n');
    
    return csvContent;
}

// ===== SERVE MAIN PAGE =====
app.get('/', (req, res) => {
    console.log('🏠 Serving main page');
    res.sendFile(__dirname + '/index.html');
});

// ===== ERROR HANDLERS =====

// 404 handler
app.use((req, res) => {
    console.log('❌ Route not found:', req.method, req.url);
    res.status(404).json({ 
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.url}`,
        availableEndpoints: [
            'GET /api/health',
            'GET /api/patients',
            'POST /api/patients',
            'PUT /api/patients',
            'DELETE /api/patients/:id',
            'GET /api/patients/:id',
            'GET /api/stats',
            'POST /api/search',
            'POST /api/patients/bulk',
            'GET /api/export'
        ]
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('💥 Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    try {
        await mongoose.connection.close();
        console.log('📦 MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    try {
        await mongoose.connection.close();
        console.log('📦 MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log('🚀 ================================');
    console.log(`🚀 Enhanced Health Campaign Server`);
    console.log(`🚀 Version: 2.0.0`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🚀 Visit: http://localhost:${PORT}`);
    console.log(`🚀 Health: http://localhost:${PORT}/api/health`);
    console.log(`🚀 API Docs: http://localhost:${PORT}/api`);
    console.log('🚀 ================================');
    console.log('🚀 Features:');
    console.log('🚀 ✅ Patient Registration');
    console.log('🚀 ✅ Medical Records Management');
    console.log('🚀 ✅ Multiple Lab Tests Support');
    console.log('🚀 ✅ Edit Patient Information');
    console.log('🚀 ✅ Delete Patients');
    console.log('🚀 ✅ Advanced Search & Filtering');
    console.log('🚀 ✅ Bulk Operations');
    console.log('🚀 ✅ Data Export (JSON/CSV)');
    console.log('🚀 ✅ Audit Trail');
    console.log('🚀 ✅ Enhanced Validation');
    console.log('🚀 ================================');
});

module.exports = app;
