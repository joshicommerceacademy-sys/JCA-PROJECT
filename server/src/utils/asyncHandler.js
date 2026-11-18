function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            console.error(error);
            const status = error.status || 500;
            res.status(status).json({ status: "error", message: error.message || "Server error", ...(error.code ? { code: error.code } : {}) });
        });
    };
}

class ApiError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        if (code) this.code = code;
    }
}

module.exports = { asyncHandler, ApiError };
