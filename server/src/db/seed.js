const bcrypt = require("bcryptjs");
const { pool, query } = require("./pool");

async function seed() {
    console.log("Seeding database...");

    const adminEmail = "joshicommerceacademy@gmail.com";
    const [existingAdmin] = await query("SELECT id FROM admin_users WHERE email = $1", [adminEmail]);
    if (!existingAdmin) {
        const passwordHash = await bcrypt.hash("jca@2017", 10);
        await query(
            "INSERT INTO admin_users (email, password_hash, full_name) VALUES ($1, $2, $3)",
            [adminEmail, passwordHash, "Joshi's Commerce Academy"]
        );
        console.log(`Admin created: ${adminEmail} / jca@2017`);
    } else {
        console.log("Admin already exists, skipping.");
    }

    const standards = [
        ["JCA Entrance", "JCA"],
        ["11th Commerce", "11C"],
        ["12th Commerce", "12C"],
        ["B.Com", "BCOM"],
        ["M.Com", "MCOM"],
    ];
    for (const [name, code] of standards) {
        const [existing] = await query("SELECT id FROM standards WHERE code = $1", [code]);
        if (!existing) {
            await query("INSERT INTO standards (name, code) VALUES ($1, $2)", [name, code]);
        }
    }
    console.log("Standards seeded.");

    const centres = [
        ["Pune Main Centre", "PUN01", "FC Road, Pune"],
        ["Mumbai Centre", "MUM01", "Andheri, Mumbai"],
        ["Nashik Centre", "NSK01", "College Road, Nashik"],
    ];
    for (const [name, code, address] of centres) {
        const [existing] = await query("SELECT id FROM centres WHERE code = $1", [code]);
        if (!existing) {
            await query("INSERT INTO centres (name, code, address) VALUES ($1, $2, $3)", [name, code, address]);
        }
    }
    console.log("Centres seeded.");

    const [{ id: standardId }] = await query("SELECT id FROM standards WHERE code = 'JCA'");
    const [existingBank] = await query("SELECT id FROM question_banks WHERE name = $1", ["JCA Entrance - General"]);
    let bankId = existingBank?.id;
    if (!existingBank) {
        const [bank] = await query(
            `INSERT INTO question_banks (name, standard_id, subject, description, status)
             VALUES ($1, $2, $3, $4, 'published') RETURNING id`,
            ["JCA Entrance - General", standardId, "General Knowledge", "Sample seed question bank"]
        );
        bankId = bank.id;
    }

    const sampleQuestions = [
        ["What is the full form of GST?", "Goods and Services Tax", "General Sales Tax", "Government Service Tax", "Gross Sales Tax", "A"],
        ["Which document records a firm's profit and loss?", "Balance Sheet", "Income Statement", "Cash Flow Statement", "Trial Balance", "B"],
        ["Double-entry bookkeeping was pioneered by?", "Adam Smith", "Luca Pacioli", "Karl Marx", "John Keynes", "B"],
        ["What does 'Debit' mean in accounting?", "Increase in liability", "Left side of an account", "Right side of an account", "Decrease in asset", "B"],
        ["RBI stands for?", "Reserve Bank of India", "Regional Bank of India", "Rural Bank of India", "Registered Bank of India", "A"],
        ["Which of these is a current asset?", "Machinery", "Goodwill", "Cash", "Land", "C"],
        ["The basic accounting equation is?", "Assets = Liabilities - Capital", "Assets = Liabilities + Capital", "Capital = Assets + Liabilities", "Liabilities = Assets + Capital", "B"],
        ["A cheque is an example of?", "Negotiable instrument", "Fixed asset", "Intangible asset", "Long-term liability", "A"],
        ["What is the rate of CGST + SGST commonly referred as?", "IGST", "GST", "VAT", "TDS", "B"],
        ["Which of these is NOT a factor of production?", "Land", "Labour", "Capital", "Profit", "D"],
        ["Trial balance is prepared to check?", "Profitability", "Arithmetical accuracy", "Solvency", "Liquidity", "B"],
        ["Depreciation is charged on?", "Current assets", "Fixed assets", "Current liabilities", "Intangible assets only", "B"],
    ];

    for (const [q, a, b, c, d, correct] of sampleQuestions) {
        const [existing] = await query("SELECT id FROM questions WHERE question_text = $1", [q]);
        if (!existing) {
            await query(
                `INSERT INTO questions (bank_id, question_text, option_a, option_b, option_c, option_d, correct_answer, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'published')`,
                [bankId, q, a, b, c, d, correct]
            );
        }
    }
    console.log("Sample question bank seeded.");

    console.log("Seeding complete.");
    await pool.end();
}

seed().catch((error) => {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
});
