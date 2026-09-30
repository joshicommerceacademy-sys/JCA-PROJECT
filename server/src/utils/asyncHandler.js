function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            console.error(error);
            const status = error.status || 500;
            res.status(status).json({ status: "error", message: error.message || "Server error" });
        });
    };
}

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

module.exports = { asyncHandler, ApiError };
