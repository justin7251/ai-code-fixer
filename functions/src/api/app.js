const express = require('express');
const cors = require('cors');
const app = express();

// Import routes
const repositoriesRouter = require('./routes/repositories');
const projectsRouter = require('./routes/projects');

// Import middlewares
const { corsOptions } = require('./middlewares/cors');

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Parse JSON bodies
app.use(express.json());

// Log all requests for debugging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Health check route
app.get('/', (req, res) => {
    res.json({ status: 'API is running' });
});

// Consolidated API routes
app.use('/api', (req, res, next) => {
    // Add any global API middleware here
    next();
});

// Main API routes
app.use('/api/repositories', repositoriesRouter);
app.use('/api/projects', projectsRouter);

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    // Handle CORS errors
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ 
            error: 'CORS Error',
            message: 'Request not allowed from this origin'
        });
    }
    
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = app; 