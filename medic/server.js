// Load environment variables
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced middleware with security and logging
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve static files from current directory
app.use(express.static('.'));

// MongoDB connection with enhanced error handling
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is not set');
    console.error('Please set MONGODB_URI in your .env file or environment variables');
    process.exit(1);
}

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ Connected to MongoDB successfully');
    console.log('📍 Database:', mongoose.connection.name);
})
.catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
});

// Enhanced Patient Schema - Production Ready with Multi-Service Support
const patientSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Patient name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters long'],
        maxlength: [100, 'Name cannot exceed 100 characters'],
        validate: {
            validator: function(v) {
                return /^[a-zA-Z\s\-\.\']+$/.test(v);
            },
            message: 'Name can only contain letters, spaces, hyphens, dots, and apostrophes'
        }
    },
    age: { 
        type: Number,
        required: [true, 'Patient age is required'],
        min: [0, 'Age cannot be negative'],
        max: [150, 'Age cannot exceed 150 years'],
        validate: {
            validator: Number.isInteger,
            message: 'Age must be a whole number'
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
                // Allow various phone number formats but ensure minimum length
                const cleaned = v.replace(/\D/g, '');
                return cleaned.length >= 8 && cleaned.length <= 15;
            },
            message: 'Please enter a valid phone number (8-15 digits)'
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
    // Legacy field - kept for backward compatibility only
    service: { 
        type: String
        // No validation - this is legacy only
    },
    // Primary services field - UPDATED with new services
    services: {
        type: [String],
        required: [true, 'At least one service is required'],
        validate: {
            validator: function(services) {
                if (!services || services.length === 0) {
                    return false;
                }
                const validServices = [
                    'General consultations', 
                    'Eye consultation',  // Updated from 'Eye con'
                    'Gynaecology', 
                    'Cervical cancer screening', 
                    'Sexual and reproductive health',  // NEW SERVICE
                    'Dental consultation'  // NEW SERVICE
                ];
                return services.every(service => validServices.includes(service));
            },
            message: 'Invalid service specified. Valid services are: General consultations, Eye consultation, Gynaecology, Cervical cancer screening, Sexual and reproductive health, Dental consultation'
        }
    },
    registrationDate: { 
        type: String, 
        required: true,
        default: () => new Date().toLocaleDateString('en-GB')
    },
    registrationTime: { 
        type: String, 
        default: () => new Date().toLocaleTimeString('en-GB')
    },
    status: { 
        type: String, 
        default: 'registered',
        enum: {
            values: ['registered', 'completed', 'cancelled', 'deleted'],
            message: 'Status must be one of: registered, completed, cancelled, deleted'
        },
        index: true
    },
    diagnosis: { 
        type: String, 
        default: '',
        trim: true,
        maxlength: [2000, 'Diagnosis cannot exceed 2000 characters']
    },
    labTests: {
        type: [String],
        default: [],
        validate: {
            validator: function(tests) {
                if (!tests || tests.length === 0) return true; // Allow empty array
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
        maxlength: [3000, 'Treatment plan cannot exceed 3000 characters']
    },
    completionDate: { 
        type: String, 
        default: ''
    },
    completionTime: { 
        type: String, 
        default: ''
    },
    // Enhanced audit fields
    lastModified: {
        type: Date,
        default: Date.now,
        index: true
    },
    modificationHistory: [{
        action: {
            type: String,
            enum: ['created', 'updated', 'completed', 'cancelled', 'deleted'],
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        changes: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        userAgent: String,
        ipAddress: String
    }],
    // Soft delete support
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },
    deletedAt: {
        type: Date
    }
}, { 
    timestamps: true,
    versionKey: false
});

// Compound indexes for better query performance
patientSchema.index({ tel: 1 }, { unique: true });
patientSchema.index({ name: 1, familyGroup: 1 });
patientSchema.index({ status: 1, createdAt: -1 });
patientSchema.index({ services: 1, status: 1 });
patientSchema.index({ familyGroup: 1, status: 1 });
patientSchema.index({ isDeleted: 1, status: 1 });
patientSchema.index({ createdAt: -1 });

// Pre-save middleware for data normalization and validation
patientSchema.pre('save', function(next) {
    this.lastModified = new Date();
    
    // Normalize phone number
    if (this.tel) {
        this.tel = this.tel.replace(/\s+/g, ' ').trim();
    }
    
    // Normalize name
    if (this.name) {
        this.name = this.name.replace(/\s+/g, ' ').trim();
    }
    
    // Handle service/services normalization and legacy support
    if (this.services && this.services.length > 0) {
        // Convert 'Eye con' to 'Eye consultation' for backward compatibility
        this.services = this.services.map(service => {
            if (service === 'Eye con') {
                return 'Eye consultation';
            }
            return service;
        });
        // Clear legacy service field
        this.service = undefined;
    } else if (this.service && (!this.services || this.services.length === 0)) {
        // Convert single service to services array
        let serviceToAdd = this.service;
        // Handle legacy 'Eye con' conversion
        if (serviceToAdd === 'Eye con') {
            serviceToAdd = 'Eye consultation';
        }
        this.services = [serviceToAdd];
        this.service = undefined;
    }
    
    // Final validation - ensure we have services
    if (!this.services || this.services.length === 0) {
        return next(new Error('At least one service is required'));
    }
    
    // Handle age conversion if it comes as string
    if (typeof this.age === 'string') {
        const ageNum = parseInt(this.age);
        if (isNaN(ageNum)) {
            return next(new Error('Age must be a valid number'));
        }
        this.age = ageNum;
    }
    
    next();
});

// Pre-update middleware
patientSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
    this.set({ lastModified: new Date() });
    
    // Handle age conversion in updates
    if (this.getUpdate().age && typeof this.getUpdate().age === 'string') {
        const ageNum = parseInt(this.getUpdate().age);
        if (!isNaN(ageNum)) {
            this.set({ age: ageNum });
        }
    }
    
    // Handle services conversion in updates
    const update = this.getUpdate();
    if (update.services && Array.isArray(update.services)) {
        // Convert 'Eye con' to 'Eye consultation' for backward compatibility
        const convertedServices = update.services.map(service => {
            if (service === 'Eye con') {
                return 'Eye consultation';
            }
            return service;
        });
        this.set({ services: convertedServices });
        // Clear legacy service field
        this.set({ service: undefined });
    } else if (update.service && (!update.services || update.services.length === 0)) {
        // Convert single service to services array
        let serviceToAdd = update.service;
        if (serviceToAdd === 'Eye con') {
            serviceToAdd = 'Eye consultation';
        }
        this.set({ services: [serviceToAdd] });
        this.set({ service: undefined });
    }
    
    next();
});

// Instance methods
patientSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.status = 'deleted';
    return this.save();
};

patientSchema.methods.restore = function() {
    this.isDeleted = false;
    this.deletedAt = undefined;
    this.status = 'registered';
    return this.save();
};

// Static methods
patientSchema.statics.findActive = function() {
    return this.find({ isDeleted: { $ne: true } });
};

patientSchema.statics.findDeleted = function() {
    return this.find({ isDeleted: true });
};

const Patient = mongoose.model('Patient', patientSchema);

// ===== UTILITY FUNCTIONS =====

// Enhanced error handler middleware
const handleError = (res, error, defaultMessage = 'An error occurred', req = null) => {
    console.error('❌ Error occurred:', {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        url: req?.url,
        method: req?.method,
        timestamp: new Date().toISOString()
    });
    
    if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ 
            success: false,
            error: 'Validation failed', 
            details: errors,
            message: errors.join(', ')
        });
    }
    
    if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        const value = error.keyValue[field];
        return res.status(409).json({ 
            success: false,
            error: 'Duplicate entry', 
            message: `A patient with ${field} "${value}" already exists`
        });
    }
    
    if (error.name === 'CastError') {
        return res.status(400).json({ 
            success: false,
            error: 'Invalid ID format',
            message: 'The provided ID is not valid'
        });
    }
    
    if (error.name === 'MongoNetworkError') {
        return res.status(503).json({
            success: false,
            error: 'Database connection error',
            message: 'Unable to connect to database. Please try again later.'
        });
    }
    
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ 
        success: false,
        error: defaultMessage,
        message: error.message || defaultMessage
    });
};

// Validation helpers
const validateObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};

const sanitizeInput = (obj) => {
    const sanitized = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined && obj[key] !== null) {
            if (typeof obj[key] === 'string') {
                sanitized[key] = obj[key].trim();
            } else {
                sanitized[key] = obj[key];
            }
        }
    });
    return sanitized;
};

// Add modification history with enhanced tracking
const addModificationHistory = async (patientId, action, changes = {}, req = null) => {
    try {
        const historyEntry = {
            action,
            timestamp: new Date(),
            changes
        };
        
        if (req) {
            historyEntry.userAgent = req.get('User-Agent');
            historyEntry.ipAddress = req.ip || req.connection.remoteAddress;
        }
        
        await Patient.findByIdAndUpdate(patientId, {
            $push: { modificationHistory: historyEntry }
        });
    } catch (error) {
        console.error('Failed to add modification history:', error);
    }
};

// ===== API ENDPOINTS =====

// 1. Enhanced Health Check
app.get('/api/health', async (req, res) => {
    try {
        console.log('💓 Health check requested');
        
        // Test database connection
        await mongoose.connection.db.admin().ping();
        
        // Get comprehensive stats
        const [
            totalPatients,
            activePatients,
            pendingPatients,
            completedPatients,
            deletedPatients,
            recentRegistrations
        ] = await Promise.all([
            Patient.countDocuments(),
            Patient.countDocuments({ isDeleted: { $ne: true } }),
            Patient.countDocuments({ status: 'registered', isDeleted: { $ne: true } }),
            Patient.countDocuments({ status: 'completed', isDeleted: { $ne: true } }),
            Patient.countDocuments({ isDeleted: true }),
            Patient.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                isDeleted: { $ne: true }
            })
        ]);
        
        res.json({ 
            success: true,
            status: 'OK',
            timestamp: new Date().toISOString(),
            mongoStatus: 'connected',
            environment: process.env.NODE_ENV || 'development',
            version: '3.1.0',
            features: [
                'Multi-Service Selection Support',
                'Sexual and Reproductive Health Service',
                'Dental Consultation Service',
                'Enhanced Service Management'
            ],
            stats: {
                totalPatients,
                activePatients,
                pendingPatients,
                completedPatients,
                deletedPatients,
                recentRegistrations,
                completionRate: activePatients > 0 ? Math.round((completedPatients / activePatients) * 100) : 0
            },
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    } catch (error) {
        handleError(res, error, 'Health check failed', req);
    }
});

// 2. Get All Patients - Enhanced with advanced filtering
app.get('/api/patients', async (req, res) => {
    try {
        console.log('📋 Getting patients with filters:', req.query);
        
        const { 
            page = 1, 
            limit = 1000, 
            sort = '-createdAt',
            status,
            service,
            services,
            familyGroup,
            search,
            includeDeleted = 'false',
            dateFrom,
            dateTo
        } = req.query;
        
        // Build query
        let query = {};
        
        // Exclude deleted by default
        if (includeDeleted !== 'true') {
            query.isDeleted = { $ne: true };
        }
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (service || services) {
            const targetService = service || services;
            query.$or = [
                { service: targetService },
                { services: targetService }
            ];
        }
        
        if (familyGroup && familyGroup !== 'all') {
            query.familyGroup = familyGroup;
        }
        
        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            query.$or = [
                { name: searchRegex },
                { tel: { $regex: search.trim().replace(/\D/g, ''), $options: 'i' } }
            ];
        }
        
        // Date range filtering
        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const endDate = new Date(dateTo);
                endDate.setHours(23, 59, 59, 999);
                query.createdAt.$lte = endDate;
            }
        }
        
        // Execute query with pagination
        const patients = await Patient.find(query)
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();
        
        const total = await Patient.countDocuments(query);
        
        console.log(`✅ Found ${patients.length} patients (${total} total)`);
        
        // Return patients array for backward compatibility if no pagination requested
        if (!req.query.page && !req.query.limit) {
            return res.json(patients);
        }
        
        res.json({
            success: true,
            data: patients,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalPatients: total,
                hasNext: parseInt(page) * parseInt(limit) < total,
                hasPrev: parseInt(page) > 1,
                limit: parseInt(limit)
            },
            query: query,
            filters: { status, service, services, familyGroup, search, includeDeleted }
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve patients', req);
    }
});

// 3. Create New Patient - Enhanced with Multi-Service Support
app.post('/api/patients', async (req, res) => {
    try {
        console.log('➕ Creating new patient:', req.body.name);
        
        // Sanitize and validate input
        const inputData = sanitizeInput(req.body);
        
        const patientData = {
            name: inputData.name,
            age: inputData.age,
            sex: inputData.sex,
            occupation: inputData.occupation || '',
            tel: inputData.tel,
            familyGroup: inputData.familyGroup,
            status: 'registered'
        };
        
        // Handle services - prioritize services array, support both single and multiple
        if (inputData.services && Array.isArray(inputData.services) && inputData.services.length > 0) {
            patientData.services = inputData.services.filter(s => s && s.trim());
        } else if (inputData.service && inputData.service.trim()) {
            patientData.services = [inputData.service.trim()];
        } else {
            return res.status(400).json({ 
                success: false,
                error: 'Services required', 
                message: 'At least one service must be specified' 
            });
        }
        
        // Validate required fields
        const requiredFields = ['name', 'age', 'sex', 'tel', 'familyGroup'];
        const missingFields = requiredFields.filter(field => !patientData[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: `Please provide: ${missingFields.join(', ')}`,
                missingFields
            });
        }
        
        // Validate services
        const validServices = [
            'General consultations', 
            'Eye consultation', 
            'Gynaecology', 
            'Cervical cancer screening', 
            'Sexual and reproductive health',
            'Dental consultation'
        ];
        
        const invalidServices = patientData.services.filter(service => !validServices.includes(service));
        if (invalidServices.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid services',
                message: `Invalid services: ${invalidServices.join(', ')}. Valid services are: ${validServices.join(', ')}`,
                invalidServices,
                validServices
            });
        }
        
        // Check for duplicate phone number
        const existingPatient = await Patient.findOne({ 
            tel: patientData.tel,
            isDeleted: { $ne: true }
        });
        
        if (existingPatient) {
            return res.status(409).json({ 
                success: false,
                error: 'Duplicate phone number', 
                message: `A patient with phone number ${patientData.tel} already exists`,
                existingPatient: {
                    id: existingPatient._id,
                    name: existingPatient.name,
                    registrationDate: existingPatient.registrationDate
                }
            });
        }
        
        // Create and save patient
        const patient = new Patient(patientData);
        await patient.save();
        
        // Add creation history
        await addModificationHistory(patient._id, 'created', patientData, req);
        
        console.log('✅ Patient created successfully:', {
            id: patient._id,
            name: patient.name,
            tel: patient.tel,
            services: patient.services
        });
        
        res.status(201).json({
            success: true,
            message: `Patient registered successfully for ${patient.services.length} service${patient.services.length > 1 ? 's' : ''}`,
            data: patient
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to create patient', req);
    }
});

// 4. Update Patient - Enhanced with Multi-Service Support
app.put('/api/patients', async (req, res) => {
    try {
        const { id, ...updateData } = req.body;
        console.log('✏️ Updating patient:', id);
        
        if (!id) {
            return res.status(400).json({ 
                success: false,
                error: 'Patient ID is required' 
            });
        }
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid patient ID format' 
            });
        }
        
        // Get current patient for comparison
        const currentPatient = await Patient.findById(id);
        if (!currentPatient) {
            return res.status(404).json({ 
                success: false,
                error: 'Patient not found' 
            });
        }
        
        if (currentPatient.isDeleted) {
            return res.status(410).json({
                success: false,
                error: 'Patient has been deleted',
                message: 'Cannot update a deleted patient'
            });
        }
        
        // Sanitize update data
        const sanitizedData = sanitizeInput(updateData);
        
        // Handle services update - support both single and multiple services
        if (sanitizedData.services && Array.isArray(sanitizedData.services) && sanitizedData.services.length > 0) {
            sanitizedData.services = sanitizedData.services.filter(s => s && s.trim());
            sanitizedData.service = undefined;
        } else if (sanitizedData.service && sanitizedData.service.trim()) {
            sanitizedData.services = [sanitizedData.service.trim()];
            sanitizedData.service = undefined;
        }
        
        // Validate services if they're being updated
        if (sanitizedData.services) {
            const validServices = [
                'General consultations', 
                'Eye consultation', 
                'Gynaecology', 
                'Cervical cancer screening', 
                'Sexual and reproductive health',
                'Dental consultation'
            ];
            
            const invalidServices = sanitizedData.services.filter(service => !validServices.includes(service));
            if (invalidServices.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid services',
                    message: `Invalid services: ${invalidServices.join(', ')}. Valid services are: ${validServices.join(', ')}`,
                    invalidServices,
                    validServices
                });
            }
            
            if (sanitizedData.services.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'At least one service is required',
                    message: 'Please select at least one service'
                });
            }
        }
        
        // Add completion timestamp if completing
        if (sanitizedData.status === 'completed' && currentPatient.status !== 'completed') {
            sanitizedData.completionDate = new Date().toLocaleDateString('en-GB');
            sanitizedData.completionTime = new Date().toLocaleTimeString('en-GB');
        }
        
        // Check for phone number duplicates if tel is being updated
        if (sanitizedData.tel && sanitizedData.tel !== currentPatient.tel) {
            const existingPatient = await Patient.findOne({ 
                tel: sanitizedData.tel,
                _id: { $ne: id },
                isDeleted: { $ne: true }
            });
            
            if (existingPatient) {
                return res.status(409).json({ 
                    success: false,
                    error: 'Duplicate phone number', 
                    message: `Another patient with phone number ${sanitizedData.tel} already exists`
                });
            }
        }
        
        // Update patient
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
            if (JSON.stringify(currentPatient[key]) !== JSON.stringify(sanitizedData[key])) {
                changes[key] = {
                    from: currentPatient[key],
                    to: sanitizedData[key]
                };
            }
        });
        
        const action = sanitizedData.status === 'completed' ? 'completed' : 'updated';
        await addModificationHistory(patient._id, action, changes, req);
        
        const servicesCount = patient.services ? patient.services.length : 0;
        console.log('✅ Patient updated successfully:', patient.name, `with ${servicesCount} services`);
        
        res.json({ 
            success: true,
            message: `Patient updated successfully with ${servicesCount} service${servicesCount > 1 ? 's' : ''}`,
            data: patient,
            changes: Object.keys(changes)
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to update patient', req);
    }
});

// 5. Get Single Patient
app.get('/api/patients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { includeHistory = 'false' } = req.query;
        
        console.log('👤 Getting patient:', id);
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid patient ID format' 
            });
        }
        
        let query = Patient.findById(id);
        
        // Optionally exclude modification history for performance
        if (includeHistory !== 'true') {
            query = query.select('-modificationHistory');
        }
        
        const patient = await query;
        
        if (!patient) {
            return res.status(404).json({ 
                success: false,
                error: 'Patient not found' 
            });
        }
        
        res.json({ 
            success: true,
            data: patient 
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve patient', req);
    }
});

// 5b. Get Single Patient (POST - backward compatibility)
app.post('/api/patient', async (req, res) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return res.status(400).json({ 
                success: false,
                error: 'Patient ID is required' 
            });
        }
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid patient ID format' 
            });
        }
        
        const patient = await Patient.findById(id).select('-modificationHistory');
        
        if (!patient) {
            return res.status(404).json({ 
                success: false,
                error: 'Patient not found' 
            });
        }
        
        // Return patient directly for backward compatibility
        res.json(patient);
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve patient', req);
    }
});

// 6. Enhanced Statistics with Multi-Service Support
app.get('/api/stats', async (req, res) => {
    try {
        console.log('📊 Generating comprehensive statistics');
        
        const { period = '30' } = req.query;
        const daysBack = parseInt(period);
        const periodStart = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
        
        const [
            totalPatients,
            activePatients,
            pendingTests,
            completedRecords,
            deletedPatients,
            recentRegistrations,
            serviceStats,
            familyGroupStats,
            dailyRegistrations,
            completionTrend
        ] = await Promise.all([
            Patient.countDocuments(),
            Patient.countDocuments({ isDeleted: { $ne: true } }),
            Patient.countDocuments({ status: 'registered', isDeleted: { $ne: true } }),
            Patient.countDocuments({ status: 'completed', isDeleted: { $ne: true } }),
            Patient.countDocuments({ isDeleted: true }),
            Patient.countDocuments({
                createdAt: { $gte: periodStart },
                isDeleted: { $ne: true }
            }),
            // Enhanced service statistics with multi-service support
            Patient.aggregate([
                { $match: { isDeleted: { $ne: true } } },
                {
                    $project: {
                        allServices: {
                            $cond: {
                                if: { $gt: [{ $size: { $ifNull: ['$services', []] } }, 0] },
                                then: '$services',
                                else: { $cond: { if: '$service', then: ['$service'], else: [] } }
                            }
                        }
                    }
                },
                { $unwind: '$allServices' },
                { $group: { _id: '$allServices', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Patient.aggregate([
                { $match: { isDeleted: { $ne: true } } },
                { $group: { _id: '$familyGroup', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            // Daily registrations trend
            Patient.aggregate([
                { 
                    $match: { 
                        createdAt: { $gte: periodStart },
                        isDeleted: { $ne: true }
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            // Completion trend
            Patient.aggregate([
                { 
                    $match: { 
                        status: 'completed',
                        completionDate: { $exists: true },
                        isDeleted: { $ne: true }
                    }
                },
                {
                    $group: {
                        _id: '$completionDate',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 30 }
            ])
        ]);
        
        const completionRate = activePatients > 0 ? Math.round((completedRecords / activePatients) * 100) : 0;
        
        const stats = {
            overview: {
                totalPatients,
                activePatients,
                pendingTests,
                completedRecords,
                deletedPatients,
                completionRate,
                recentRegistrations
            },
            serviceDistribution: serviceStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            familyGroupDistribution: familyGroupStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            trends: {
                dailyRegistrations: dailyRegistrations.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                completionTrend: completionTrend.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {})
            },
            period: {
                days: daysBack,
                startDate: periodStart.toISOString(),
                endDate: new Date().toISOString()
            }
        };
        
        console.log('✅ Statistics generated successfully');
        
        res.json({
            success: true,
            data: stats,
            generatedAt: new Date().toISOString()
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve statistics', req);
    }
});

// 7. Enhanced Search with Multi-Service Support
app.post('/api/search', async (req, res) => {
    try {
        const { query, filters = {}, limit = 50 } = req.body;
        console.log('🔍 Searching for:', query, 'with filters:', filters);
        
        if (!query || query.trim().length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Search query is required' 
            });
        }
        
        const searchQuery = {
            isDeleted: { $ne: true },
            $or: [
                { name: { $regex: query.trim(), $options: 'i' } },
                { tel: { $regex: query.trim().replace(/\D/g, ''), $options: 'i' } }
            ]
        };
        
        // Add filters
        if (filters.status && filters.status !== 'all') {
            searchQuery.status = filters.status;
        }
        
        if (filters.service) {
            searchQuery.$and = searchQuery.$and || [];
            searchQuery.$and.push({
                $or: [
                    { service: filters.service },
                    { services: filters.service }
                ]
            });
        }
        
        if (filters.familyGroup && filters.familyGroup !== 'all') {
            searchQuery.familyGroup = filters.familyGroup;
        }
        
        if (filters.dateFrom || filters.dateTo) {
            searchQuery.createdAt = {};
            if (filters.dateFrom) searchQuery.createdAt.$gte = new Date(filters.dateFrom);
            if (filters.dateTo) {
                const endDate = new Date(filters.dateTo);
                endDate.setHours(23, 59, 59, 999);
                searchQuery.createdAt.$lte = endDate;
            }
        }
        
        const patients = await Patient.find(searchQuery)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .select('-modificationHistory');
        
        console.log(`✅ Found ${patients.length} patients for "${query}"`);
        
        res.json({
            success: true,
            data: patients,
            query: query,
            filters: filters,
            count: patients.length
        });
        
    } catch (error) {
        handleError(res, error, 'Search failed', req);
    }
});

// 8. Delete Patient - Enhanced with soft delete
app.delete('/api/patients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { permanent = 'false' } = req.query;
        
        console.log('🗑️ Deleting patient:', id, 'permanent:', permanent);
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid patient ID format' 
            });
        }
        
        const patient = await Patient.findById(id);
        if (!patient) {
            return res.status(404).json({ 
                success: false,
                error: 'Patient not found' 
            });
        }
        
        if (permanent === 'true') {
            // Permanent deletion
            await Patient.findByIdAndDelete(id);
            console.log('✅ Patient permanently deleted:', patient.name);
            
            res.json({
                success: true,
                message: 'Patient permanently deleted',
                deletedPatient: {
                    id: patient._id,
                    name: patient.name,
                    tel: patient.tel
                }
            });
        } else {
            // Soft delete
            await patient.softDelete();
            await addModificationHistory(id, 'deleted', { deletedAt: new Date() }, req);
            
            console.log('✅ Patient soft deleted:', patient.name);
            
            res.json({
                success: true,
                message: 'Patient deleted successfully',
                deletedPatient: {
                    id: patient._id,
                    name: patient.name,
                    tel: patient.tel
                }
            });
        }
        
    } catch (error) {
        handleError(res, error, 'Failed to delete patient', req);
    }
});

// 8b. Delete Patient (POST - backward compatibility)
app.post('/api/delete', async (req, res) => {
    try {
        const { id } = req.body;
        console.log('🗑️ Deleting patient via POST:', id);
        
        if (!id) {
            return res.status(400).json({ 
                success: false,
                error: 'Patient ID is required' 
            });
        }
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid patient ID format' 
            });
        }
        
        const patient = await Patient.findById(id);
        if (!patient) {
            return res.status(404).json({ 
                success: false,
                error: 'Patient not found' 
            });
        }
        
        // Permanent delete for backward compatibility
        await Patient.findByIdAndDelete(id);
        
        console.log('✅ Patient deleted:', patient.name);
        
        // Return format expected by frontend
        res.json({ 
            message: 'Patient deleted successfully',
            deletedPatient: {
                id: patient._id,
                name: patient.name,
                tel: patient.tel
            }
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to delete patient', req);
    }
});

// 9. Export Data - Enhanced with Multi-Service Support
app.get('/api/export', async (req, res) => {
    try {
        const { 
            format = 'json', 
            status, 
            service, 
            familyGroup, 
            includeDeleted = 'false',
            dateFrom,
            dateTo
        } = req.query;
        
        console.log('📤 Exporting data in format:', format);
        
        // Build query
        let query = {};
        
        if (includeDeleted !== 'true') {
            query.isDeleted = { $ne: true };
        }
        
        if (status && status !== 'all') query.status = status;
        
        if (service) {
            query.$or = [
                { service: service },
                { services: service }
            ];
        }
        
        if (familyGroup && familyGroup !== 'all') query.familyGroup = familyGroup;
        
        // Date range filtering
        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const endDate = new Date(dateTo);
                endDate.setHours(23, 59, 59, 999);
                query.createdAt.$lte = endDate;
            }
        }
        
        const patients = await Patient.find(query)
            .sort({ createdAt: -1 })
            .select('-modificationHistory'); // Exclude history for export
        
        const exportData = {
            exportInfo: {
                exportDate: new Date().toISOString(),
                exportedBy: 'Health Campaign System v3.1.0',
                totalRecords: patients.length,
                format: format,
                filters: { status, service, familyGroup, includeDeleted, dateFrom, dateTo },
                features: [
                    'Multi-Service Selection Support',
                    'Sexual and Reproductive Health Service', 
                    'Dental Consultation Service'
                ]
            },
            patients: patients
        };
        
        const timestamp = new Date().toISOString().split('T')[0];
        
        if (format === 'csv') {
            const csv = convertToCSV(patients);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="health_campaign_patients_${timestamp}.csv"`);
            res.send('\ufeff' + csv); // Add BOM for proper Excel encoding
        } else {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="health_campaign_patients_${timestamp}.json"`);
            res.json(exportData);
        }
        
        console.log(`✅ Exported ${patients.length} patients as ${format.toUpperCase()}`);
        
    } catch (error) {
        handleError(res, error, 'Export failed', req);
    }
});

// Enhanced CSV conversion with multi-service support
function convertToCSV(patients) {
    if (!patients.length) return 'No data available for export';
    
    const headers = [
        'ID', 'Name', 'Age', 'Sex', 'Occupation', 'Phone', 'Family Group', 
        'Services', 'Status', 'Registration Date', 'Registration Time',
        'Diagnosis', 'Lab Tests', 'Treatment Plan', 'Completion Date', 'Completion Time',
        'Created At', 'Last Modified'
    ];
    
    const escapeCsvField = (field) => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    
    const csvContent = [
        headers.join(','),
        ...patients.map(patient => {
            // Handle services - support both single and multiple services
            const servicesDisplay = patient.services && patient.services.length > 0 
                ? patient.services.join('; ') 
                : (patient.service || '');
                
            return [
                escapeCsvField(patient._id),
                escapeCsvField(patient.name),
                escapeCsvField(patient.age),
                escapeCsvField(patient.sex),
                escapeCsvField(patient.occupation || ''),
                escapeCsvField(patient.tel),
                escapeCsvField(patient.familyGroup),
                escapeCsvField(servicesDisplay),
                escapeCsvField(patient.status),
                escapeCsvField(patient.registrationDate),
                escapeCsvField(patient.registrationTime || ''),
                escapeCsvField(patient.diagnosis || ''),
                escapeCsvField(patient.labTests?.join('; ') || ''),
                escapeCsvField(patient.treatmentPlan || ''),
                escapeCsvField(patient.completionDate || ''),
                escapeCsvField(patient.completionTime || ''),
                escapeCsvField(patient.createdAt ? new Date(patient.createdAt).toLocaleString() : ''),
                escapeCsvField(patient.lastModified ? new Date(patient.lastModified).toLocaleString() : '')
            ].join(',');
        })
    ].join('\n');
    
    return csvContent;
}

// Additional endpoints for completeness...

// 10. Restore Deleted Patient
app.post('/api/patients/:id/restore', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('♻️ Restoring patient:', id);
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid patient ID format' 
            });
        }
        
        const patient = await Patient.findById(id);
        if (!patient) {
            return res.status(404).json({ 
                success: false,
                error: 'Patient not found' 
            });
        }
        
        if (!patient.isDeleted) {
            return res.status(400).json({
                success: false,
                error: 'Patient is not deleted',
                message: 'Cannot restore a patient that is not deleted'
            });
        }
        
        await patient.restore();
        await addModificationHistory(id, 'updated', { restored: true }, req);
        
        console.log('✅ Patient restored:', patient.name);
        
        res.json({
            success: true,
            message: 'Patient restored successfully',
            data: patient
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to restore patient', req);
    }
});

// 11. Get Deleted Patients
app.get('/api/patients/deleted', async (req, res) => {
    try {
        console.log('🗑️ Getting deleted patients');
        
        const { page = 1, limit = 100 } = req.query;
        
        const deletedPatients = await Patient.find({ isDeleted: true })
            .sort({ deletedAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .select('-modificationHistory');
        
        const total = await Patient.countDocuments({ isDeleted: true });
        
        res.json({
            success: true,
            data: deletedPatients,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalPatients: total,
                hasNext: parseInt(page) * parseInt(limit) < total,
                hasPrev: parseInt(page) > 1
            }
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve deleted patients', req);
    }
});

// 12. Patient History
app.get('/api/patients/:id/history', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('📜 Getting patient history:', id);
        
        if (!validateObjectId(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid patient ID format' 
            });
        }
        
        const patient = await Patient.findById(id).select('name services modificationHistory');
        
        if (!patient) {
            return res.status(404).json({ 
                success: false,
                error: 'Patient not found' 
            });
        }
        
        res.json({
            success: true,
            data: {
                patientName: patient.name,
                services: patient.services || (patient.service ? [patient.service] : []),
                history: patient.modificationHistory || []
            }
        });
        
    } catch (error) {
        handleError(res, error, 'Failed to retrieve patient history', req);
    }
});

// 13. System Information
app.get('/api/system', async (req, res) => {
    try {
        const dbStats = await mongoose.connection.db.stats();
        
        res.json({
            success: true,
            system: {
                version: '3.1.0',
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                features: [
                    'Multi-Service Selection Support',
                    'Sexual and Reproductive Health Service',
                    'Dental Consultation Service',
                    'Enhanced Service Management',
                    'Backward Compatibility',
                    'Legacy Service Migration'
                ],
                supportedServices: [
                    'General consultations',
                    'Eye consultation',
                    'Gynaecology',
                    'Cervical cancer screening',
                    'Sexual and reproductive health',
                    'Dental consultation'
                ],
                database: {
                    name: mongoose.connection.name,
                    collections: dbStats.collections,
                    dataSize: dbStats.dataSize,
                    storageSize: dbStats.storageSize,
                    indexes: dbStats.indexes
                }
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to retrieve system information', req);
    }
});

// 14. Bulk Operations - Enhanced with Multi-Service Support
app.post('/api/patients/bulk', async (req, res) => {
    try {
        const { operation, patientIds, updateData, filters } = req.body;
        console.log(`🔄 Bulk ${operation} for ${patientIds?.length || 0} patients`);
        
        if (!operation) {
            return res.status(400).json({ 
                success: false,
                error: 'Operation type is required' 
            });
        }
        
        let targetIds = patientIds;
        
        // If no specific IDs provided, use filters to find patients
        if (!targetIds && filters) {
            const query = { isDeleted: { $ne: true } };
            
            if (filters.status) query.status = filters.status;
            if (filters.familyGroup) query.familyGroup = filters.familyGroup;
            if (filters.service) {
                query.$or = [
                    { service: filters.service },
                    { services: filters.service }
                ];
            }
            
            const patients = await Patient.find(query).select('_id');
            targetIds = patients.map(p => p._id.toString());
        }
        
        if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'No patients specified for bulk operation' 
            });
        }
        
        // Validate all IDs
        const invalidIds = targetIds.filter(id => !validateObjectId(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid patient IDs', 
                invalidIds 
            });
        }
        
        let result;
        let message;
        
        switch (operation) {
            case 'delete':
                // Soft delete
                result = await Patient.updateMany(
                    { _id: { $in: targetIds } },
                    { 
                        isDeleted: true,
                        deletedAt: new Date(),
                        status: 'deleted',
                        lastModified: new Date()
                    }
                );
                message = `${result.modifiedCount} patients deleted successfully`;
                break;
                
            case 'permanentDelete':
                result = await Patient.deleteMany({ _id: { $in: targetIds } });
                message = `${result.deletedCount} patients permanently deleted`;
                break;
                
            case 'restore':
                result = await Patient.updateMany(
                    { _id: { $in: targetIds }, isDeleted: true },
                    { 
                        isDeleted: false,
                        $unset: { deletedAt: 1 },
                        status: 'registered',
                        lastModified: new Date()
                    }
                );
                message = `${result.modifiedCount} patients restored successfully`;
                break;
                
            case 'update':
                if (!updateData) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Update data is required for bulk update' 
                    });
                }
                
                const sanitizedUpdateData = sanitizeInput(updateData);
                sanitizedUpdateData.lastModified = new Date();
                
                // Handle services in bulk update
                if (sanitizedUpdateData.services) {
                    const validServices = [
                        'General consultations', 
                        'Eye consultation', 
                        'Gynaecology', 
                        'Cervical cancer screening', 
                        'Sexual and reproductive health',
                        'Dental consultation'
                    ];
                    
                    const invalidServices = sanitizedUpdateData.services.filter(service => !validServices.includes(service));
                    if (invalidServices.length > 0) {
                        return res.status(400).json({
                            success: false,
                            error: 'Invalid services in bulk update',
                            invalidServices,
                            validServices
                        });
                    }
                }
                
                result = await Patient.updateMany(
                    { _id: { $in: targetIds }, isDeleted: { $ne: true } },
                    sanitizedUpdateData
                );
                message = `${result.modifiedCount} patients updated successfully`;
                break;
                
            case 'complete':
                result = await Patient.updateMany(
                    { _id: { $in: targetIds }, status: 'registered', isDeleted: { $ne: true } },
                    { 
                        status: 'completed',
                        completionDate: new Date().toLocaleDateString('en-GB'),
                        completionTime: new Date().toLocaleTimeString('en-GB'),
                        lastModified: new Date()
                    }
                );
                message = `${result.modifiedCount} patients marked as completed`;
                break;
                
            default:
                return res.status(400).json({ 
                    success: false,
                    error: 'Invalid operation type',
                    validOperations: ['delete', 'permanentDelete', 'restore', 'update', 'complete']
                });
        }
        
        console.log(`✅ Bulk ${operation} completed:`, result);
        
        res.json({ 
            success: true,
            message,
            operation,
            result,
            affectedCount: result.modifiedCount || result.deletedCount || 0,
            targetCount: targetIds.length
        });
        
    } catch (error) {
        handleError(res, error, 'Bulk operation failed', req);
    }
});

// ===== SERVE MAIN PAGE =====
app.get('/', (req, res) => {
    console.log('🏠 Serving main page');
    res.sendFile(__dirname + '/index.html');
});

// API documentation endpoint - Updated
app.get('/api', (req, res) => {
    res.json({
        name: 'Health Campaign Management API',
        version: '3.1.0',
        description: 'Comprehensive patient registration and medical records management system with multi-service support',
        newFeatures: [
            'Multi-Service Selection - Patients can register for multiple services',
            'Sexual and Reproductive Health Service',
            'Dental Consultation Service',
            'Enhanced Service Management',
            'Backward Compatibility with legacy single service'
        ],
        supportedServices: [
            'General consultations',
            'Eye consultation',
            'Gynaecology', 
            'Cervical cancer screening',
            'Sexual and reproductive health',
            'Dental consultation'
        ],
        endpoints: {
            'GET /api/health': 'System health check and statistics',
            'GET /api/patients': 'Get all patients with filtering and pagination',
            'POST /api/patients': 'Create new patient with multi-service support',
            'PUT /api/patients': 'Update patient information with multi-service support',
            'GET /api/patients/:id': 'Get single patient by ID',
            'DELETE /api/patients/:id': 'Delete patient (soft delete by default)',
            'POST /api/patients/:id/restore': 'Restore deleted patient',
            'GET /api/patients/deleted': 'Get deleted patients',
            'GET /api/patients/:id/history': 'Get patient modification history',
            'GET /api/stats': 'Get comprehensive system statistics',
            'POST /api/search': 'Search patients with advanced filters',
            'POST /api/patients/bulk': 'Bulk operations on patients',
            'GET /api/export': 'Export patient data (JSON/CSV)',
            'GET /api/system': 'Get system information',
            'POST /api/patient': 'Get single patient (legacy endpoint)',
            'POST /api/delete': 'Delete patient (legacy endpoint)'
        },
        features: [
            'Multi-Service Patient Registration',
            'Medical Records with Lab Tests',
            'Multiple Services Support per Patient',
            'Advanced Search & Filtering',
            'Soft Delete with Restore',
            'Bulk Operations',
            'Data Export (JSON/CSV)',
            'Comprehensive Audit Trail',
            'Enhanced Validation',
            'Performance Optimized',
            'Production Ready',
            'Backward Compatibility'
        ]
    });
});

// ===== ERROR HANDLERS =====

// 404 handler
app.use((req, res) => {
    console.log('❌ Route not found:', req.method, req.url);
    res.status(404).json({ 
        success: false,
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.url}`,
        suggestion: 'Visit /api for available endpoints'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('💥 Unhandled error:', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        url: req.url,
        method: req.method
    });
    
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ===== GRACEFUL SHUTDOWN =====
const gracefulShutdown = async (signal) => {
    console.log(`🛑 ${signal} received, shutting down gracefully...`);
    try {
        await mongoose.connection.close();
        console.log('📦 MongoDB connection closed');
        console.log('👋 Server shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});

// ===== START SERVER =====
const server = app.listen(PORT, () => {
    console.log('🚀 ========================================');
    console.log('🚀  Health Campaign Management System');
    console.log('🚀  Multi-Service Support Server v3.1.0');
    console.log('🚀 ========================================');
    console.log(`🚀  Port: ${PORT}`);
    console.log(`🚀  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🚀  URL: http://localhost:${PORT}`);
    console.log(`🚀  Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🚀  API Documentation: http://localhost:${PORT}/api`);
    console.log('🚀 ========================================');
    console.log('🚀  NEW FEATURES v3.1.0:');
    console.log('🚀  ✅ Multi-Service Selection Support');
    console.log('🚀  ✅ Sexual and Reproductive Health Service');
    console.log('🚀  ✅ Dental Consultation Service');
    console.log('🚀  ✅ Enhanced Service Management');
    console.log('🚀  ✅ Backward Compatibility');
    console.log('🚀 ========================================');
    console.log('🚀  SUPPORTED SERVICES:');
    console.log('🚀  🏥 General consultations');
    console.log('🚀  👁️ Eye consultation');
    console.log('🚀  👩‍⚕️ Gynaecology');
    console.log('🚀  🔬 Cervical cancer screening');
    console.log('🚀  💕 Sexual and reproductive health');
    console.log('🚀  🦷 Dental consultation');
    console.log('🚀 ========================================');
    console.log('🚀  CORE FEATURES:');
    console.log('🚀  ✅ Enhanced Patient Registration');
    console.log('🚀  ✅ Advanced Medical Records Management');
    console.log('🚀  ✅ Multiple Services & Lab Tests Support');
    console.log('🚀  ✅ Full CRUD Operations');
    console.log('🚀  ✅ Soft Delete with Restore');
    console.log('🚀  ✅ Advanced Search & Filtering');
    console.log('🚀  ✅ Bulk Operations');
    console.log('🚀  ✅ Data Export (JSON/CSV)');
    console.log('🚀  ✅ Comprehensive Audit Trail');
    console.log('🚀  ✅ Enhanced Validation & Error Handling');
    console.log('🚀  ✅ Performance Optimized with Indexes');
    console.log('🚀  ✅ Production Ready Architecture');
    console.log('🚀 ========================================');
});

// Set server timeout for large operations
server.timeout = 300000; // 5 minutes

module.exports = app;
