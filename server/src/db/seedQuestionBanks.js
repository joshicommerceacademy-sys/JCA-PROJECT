// Idempotent: creates the Economics / Costing banks and tops General Knowledge up to 50 questions.
// Run: node src/db/seedQuestionBanks.js
const { query, pool } = require("./pool");

// [question, correct, wrong1, wrong2, wrong3]
const ECONOMICS = [
  ["Who is regarded as the father of modern economics?", "Adam Smith", "Karl Marx", "J.M. Keynes", "Alfred Marshall"],
  ["'The Wealth of Nations' was written by?", "Adam Smith", "David Ricardo", "T.R. Malthus", "A.C. Pigou"],
  ["Microeconomics studies?", "Individual units such as households and firms", "The economy as a whole", "Only government budgets", "Only international trade"],
  ["Macroeconomics deals with?", "National income, inflation and unemployment", "A single consumer's choice", "One firm's costs", "The price of one commodity"],
  ["According to the law of demand, when price rises (other things equal), quantity demanded?", "Falls", "Rises", "Stays constant", "Doubles"],
  ["A normal demand curve slopes?", "Downward from left to right", "Upward from left to right", "Horizontal", "Vertical"],
  ["Which of these is a determinant of demand?", "Consumer income", "Cost of raw materials", "Production technology", "Number of sellers"],
  ["According to the law of supply, when price rises, quantity supplied?", "Rises", "Falls", "Is unchanged", "Becomes zero"],
  ["Equilibrium price is the price at which?", "Demand equals supply", "Demand exceeds supply", "Supply exceeds demand", "Price is zero"],
  ["Elasticity of demand measures?", "Responsiveness of quantity demanded to a change in price", "Change in supply", "Change in income only", "Change in taxes"],
  ["Demand for necessities such as salt is generally?", "Inelastic", "Highly elastic", "Perfectly elastic", "Unitary elastic"],
  ["A good whose demand rises when consumer income rises is called?", "A normal good", "An inferior good", "A Giffen good", "A free good"],
  ["Scarcity in economics means?", "Limited resources against unlimited wants", "Abundant resources", "No human wants", "Only free goods exist"],
  ["Opportunity cost is?", "The value of the next best alternative forgone", "The money cost of a good", "The cost of production", "A sunk cost"],
  ["Which factor of production earns rent?", "Land", "Labour", "Capital", "Entrepreneur"],
  ["Wages are the reward for?", "Labour", "Land", "Capital", "Entrepreneurship"],
  ["Interest is the reward for?", "Capital", "Land", "Labour", "Enterprise"],
  ["Profit is the reward of the?", "Entrepreneur", "Labourer", "Landlord", "Banker"],
  ["GDP stands for?", "Gross Domestic Product", "Gross Development Plan", "General Domestic Price", "Gross Domestic Profit"],
  ["GDP measures?", "Total value of final goods and services produced within a country in a year", "Total exports of a country", "Government revenue", "Money supply"],
  ["Inflation means?", "A sustained rise in the general price level", "A fall in prices", "A rise in employment", "A fall in taxes"],
  ["Deflation means?", "A sustained fall in the general price level", "A rise in the price level", "Stable prices", "A rise in GDP"],
  ["Which institution controls monetary policy in India?", "Reserve Bank of India", "SEBI", "NITI Aayog", "Finance Commission"],
  ["The repo rate is the rate at which?", "RBI lends short-term funds to commercial banks", "Banks lend to the public", "Banks borrow from the public", "Government borrows from RBI"],
  ["CRR stands for?", "Cash Reserve Ratio", "Credit Reserve Rate", "Central Reserve Requirement", "Cash Return Ratio"],
  ["Fiscal policy relates to?", "Government taxation and expenditure", "Interest rates", "Printing of money", "Exchange rates"],
  ["Which of these is a direct tax?", "Income tax", "GST", "Customs duty", "Excise duty"],
  ["Which of these is an indirect tax?", "GST", "Income tax", "Corporate tax", "Capital gains tax"],
  ["Monopoly is a market with?", "A single seller", "Many sellers", "Two sellers", "Many buyers and sellers"],
  ["Perfect competition is characterised by?", "Many buyers and sellers with a homogeneous product", "A single seller", "Differentiated products", "Barriers to entry"],
  ["A market with only a few sellers is called?", "Oligopoly", "Monopoly", "Perfect competition", "Monopsony"],
  ["In 2015 the Planning Commission of India was replaced by?", "NITI Aayog", "Finance Commission", "RBI", "SEBI"],
  ["The Indian economy is classified as a?", "Mixed economy", "Purely capitalist economy", "Purely socialist economy", "Barter economy"],
  ["Which of these belongs to the primary sector?", "Agriculture", "Manufacturing", "Banking", "Insurance"],
  ["Which of these belongs to the secondary sector?", "Manufacturing", "Agriculture", "Fishing", "Banking"],
  ["Which of these belongs to the tertiary sector?", "Banking services", "Farming", "Fishing", "Mining"],
  ["Per capita income is?", "National income divided by population", "Total national income", "Total savings", "Total government spending"],
  ["The barter system involves?", "Exchange of goods for goods", "Use of money", "Use of credit cards", "Use of cheques"],
  ["Which is the central bank of India?", "Reserve Bank of India", "State Bank of India", "NABARD", "IDBI Bank"],
  ["The law of diminishing marginal utility says that as consumption increases, marginal utility?", "Decreases", "Increases", "Remains constant", "Becomes infinite"],
  ["Total utility is maximum when marginal utility is?", "Zero", "Maximum", "Negative", "Equal to price"],
  ["Stagflation is a situation of?", "High inflation with high unemployment and low growth", "Low inflation with high growth", "Deflation with growth", "Falling prices and full employment"],
  ["Unemployment of farm workers during the off-season is called?", "Seasonal unemployment", "Structural unemployment", "Frictional unemployment", "Cyclical unemployment"],
  ["Disguised unemployment means?", "More workers than needed, with zero marginal productivity", "No one is working", "Educated people without jobs", "Workers leaving voluntarily"],
  ["The balance of payments records?", "A country's economic transactions with the rest of the world", "The government budget", "Bank deposits", "Domestic trade only"],
  ["Devaluation means?", "An official reduction in the value of a currency", "An increase in the value of a currency", "Printing more money", "Raising taxes"],
  ["The headquarters of the World Trade Organization is at?", "Geneva", "New York", "Paris", "London"],
  ["Which of these is a public good?", "National defence", "A private car", "A restaurant meal", "A mobile phone"],
  ["Economic growth is measured by the increase in?", "Real GDP", "Nominal prices", "Population", "Imports"],
  ["The approach to GDP that adds consumption, investment, government spending and net exports is the?", "Expenditure approach", "Income approach", "Output approach", "Value approach"],
];

const COSTING = [
  ["Cost accounting is concerned with?", "Ascertaining, recording and controlling costs", "Only tax filing", "Preparing balance sheets for outsiders", "Auditing of accounts"],
  ["Which cost changes in total with the level of output?", "Variable cost", "Fixed cost", "Sunk cost", "Committed cost"],
  ["Rent of a factory building is a?", "Fixed cost", "Variable cost", "Direct material", "Prime cost"],
  ["Prime cost equals?", "Direct material + direct labour + direct expenses", "Direct material + overheads", "Factory cost + administration cost", "Works cost + profit"],
  ["Factory (works) cost equals?", "Prime cost + factory overheads", "Prime cost + selling overheads", "Prime cost only", "Cost of sales"],
  ["Cost of production equals?", "Works cost + administration overheads", "Prime cost", "Works cost only", "Sales price"],
  ["Cost of sales equals?", "Cost of production + selling and distribution overheads", "Prime cost + profit", "Raw materials purchased", "Factory cost minus overheads"],
  ["Raw material consumed in making a product is?", "Direct material", "Indirect material", "Overhead", "Abnormal loss"],
  ["Wages of a machine operator working directly on production are?", "Direct labour", "Indirect labour", "Administration overhead", "Selling overhead"],
  ["Salary of a factory supervisor is?", "Indirect labour (factory overhead)", "Direct labour", "Direct material", "Selling expense"],
  ["Advertising expense is a?", "Selling overhead", "Factory overhead", "Prime cost", "Direct expense"],
  ["EOQ stands for?", "Economic Order Quantity", "Equal Output Quantity", "Estimated Order Quota", "Economic Output Quality"],
  ["The Economic Order Quantity is calculated as?", "√(2 × annual demand × ordering cost ÷ carrying cost per unit)", "Annual demand × ordering cost", "Carrying cost ÷ ordering cost", "(Annual demand + ordering cost) ÷ 2"],
  ["FIFO stands for?", "First In First Out", "Fast In Fast Out", "Final Inventory First Out", "Fixed In Fixed Out"],
  ["Under FIFO, materials are issued at the cost of?", "The earliest purchases", "The latest purchases", "The average of all purchases", "Standard cost only"],
  ["In a period of rising prices, FIFO gives?", "A higher closing stock value", "A lower closing stock value", "No effect on closing stock", "A lower profit than LIFO"],
  ["Reorder level equals?", "Maximum consumption × maximum reorder period", "Minimum stock − average stock", "Average consumption only", "EOQ ÷ 2"],
  ["Minimum stock level equals?", "Reorder level − (normal consumption × normal reorder period)", "EOQ", "Maximum level − average level", "Reorder level + normal usage"],
  ["Maximum stock level equals?", "Reorder level + reorder quantity − (minimum consumption × minimum reorder period)", "Reorder level − EOQ", "Minimum level + average level", "EOQ × 2"],
  ["Average stock level equals?", "(Minimum level + maximum level) ÷ 2", "Maximum level − minimum level", "Minimum level × maximum level", "Reorder level ÷ 2"],
  ["Danger level of stock is a level below the?", "Minimum level", "Maximum level", "Reorder level", "Average level"],
  ["ABC analysis is a technique of?", "Inventory control based on value", "Wage payment", "Overhead absorption", "Budgeting"],
  ["Under ABC analysis, 'A' items are?", "High in value and few in number", "Low in value and many in number", "Medium in value", "Zero in value"],
  ["Idle time is?", "Time paid for but not used on production", "Time spent on overtime", "Time spent on production", "Time spent on training only"],
  ["Overtime premium is?", "The extra amount paid over the normal wage rate", "The normal wage", "A bonus on profit", "A pension payment"],
  ["Under the time rate system, wages depend on?", "Time worked", "Output produced", "Quality of work", "Sales made"],
  ["Under the piece rate system, wages depend on?", "Units produced", "Hours worked", "Attendance", "Seniority"],
  ["The Halsey plan is a?", "Premium bonus plan", "Piece rate plan", "Day rate plan", "Profit sharing plan"],
  ["Overheads are?", "Indirect costs", "Direct costs", "Prime costs", "Sales revenue"],
  ["Allocation of overheads means?", "Charging a whole item of cost to a single cost centre", "Spreading an item over many cost centres", "Charging overheads to units", "Writing off overheads"],
  ["Apportionment of overheads means?", "Distributing overheads among cost centres in proportion to benefit", "Allotting a whole item to one cost centre", "Charging overheads to cost units", "Eliminating overheads"],
  ["Absorption of overheads means?", "Charging overheads to cost units", "Allocating them to departments", "Apportioning rent", "Writing them off"],
  ["A suitable basis for apportioning factory rent is?", "Floor area", "Number of workers", "Machine hours", "Wages paid"],
  ["A suitable basis for apportioning depreciation of machinery is?", "Value of machinery", "Floor area", "Number of employees", "Light points"],
  ["Machine hour rate equals?", "Overhead of the machine ÷ machine hours", "Wages ÷ hours", "Sales ÷ hours", "Units ÷ hours"],
  ["Break-even point is where?", "Total revenue equals total cost", "Profit is maximum", "Loss is maximum", "Fixed cost is zero"],
  ["Contribution equals?", "Sales − variable cost", "Sales − fixed cost", "Sales − total cost", "Fixed cost − variable cost"],
  ["P/V ratio equals?", "Contribution ÷ sales × 100", "Profit ÷ fixed cost × 100", "Sales ÷ contribution", "Variable cost ÷ sales"],
  ["Break-even point in units equals?", "Fixed cost ÷ contribution per unit", "Fixed cost ÷ selling price", "Variable cost ÷ contribution", "Contribution ÷ fixed cost"],
  ["Margin of safety equals?", "Actual sales − break-even sales", "Break-even sales − actual sales", "Sales − variable cost", "Fixed cost ÷ P/V ratio"],
  ["Job costing is used when?", "Work is done on a customer's specific order", "Production is continuous and in bulk", "Only services are provided", "A single product is made continuously"],
  ["Process costing is suitable for?", "Continuous production such as chemicals or textiles", "Construction contracts", "Custom furniture", "One-off jobs"],
  ["Contract costing is applied to?", "Construction of buildings and bridges", "Oil refining", "Sugar milling", "Soap manufacturing"],
  ["Abnormal loss in a process is?", "A loss beyond the normal expected level, charged to the costing profit and loss account", "An expected loss", "Added to the cost of good units", "Ignored completely"],
  ["Normal loss in a process is?", "An unavoidable expected loss, whose cost is borne by good units", "An avoidable excessive loss", "Credited to profit", "Charged to the costing profit and loss account"],
  ["Marginal costing treats fixed cost as a?", "Period cost", "Product cost", "Variable cost", "Prime cost"],
  ["Standard costing compares actual costs with?", "Predetermined standards", "Last year's costs", "Market prices", "Competitors' costs"],
  ["Material cost variance equals?", "Standard cost of material for actual output − actual cost", "Actual sales − budgeted sales", "Sales − cost", "Standard price × actual price"],
  ["A budget is?", "A financial plan for a future period", "A record of past transactions", "An audit report", "A tax return"],
  ["Zero-based budgeting starts from?", "A zero base, justifying every expense", "The previous year's budget", "The average of past years", "Forecast sales only"],
];

const GK = [
  ["What is the capital of India?", "New Delhi", "Mumbai", "Kolkata", "Chennai"],
  ["Which is the largest Indian state by area?", "Rajasthan", "Maharashtra", "Madhya Pradesh", "Uttar Pradesh"],
  ["What is the national animal of India?", "Tiger", "Lion", "Elephant", "Leopard"],
  ["What is the national bird of India?", "Peacock", "Sparrow", "Parrot", "Eagle"],
  ["What is the national flower of India?", "Lotus", "Rose", "Marigold", "Jasmine"],
  ["Who is known as the Father of the Nation in India?", "Mahatma Gandhi", "Jawaharlal Nehru", "Sardar Patel", "Subhas Chandra Bose"],
  ["Who was the first Prime Minister of India?", "Jawaharlal Nehru", "Lal Bahadur Shastri", "Indira Gandhi", "Sardar Patel"],
  ["Who was the first President of India?", "Dr. Rajendra Prasad", "Dr. S. Radhakrishnan", "Dr. Zakir Husain", "R. Venkataraman"],
  ["The Constitution of India came into effect on?", "26 January 1950", "15 August 1947", "26 November 1949", "2 October 1950"],
  ["Independence Day of India is celebrated on?", "15 August", "26 January", "2 October", "14 November"],
  ["Which is the longest river flowing within India?", "Ganga", "Yamuna", "Godavari", "Narmada"],
  ["Which is the highest mountain peak in India?", "Kangchenjunga", "Mount Everest", "Nanda Devi", "K2"],
  ["The Taj Mahal is located in which city?", "Agra", "Delhi", "Jaipur", "Lucknow"],
  ["Who wrote the Indian national anthem?", "Rabindranath Tagore", "Bankim Chandra Chatterjee", "Sarojini Naidu", "Muhammad Iqbal"],
  ["What is the currency of Japan?", "Yen", "Won", "Yuan", "Dollar"],
  ["Which is the largest planet in the solar system?", "Jupiter", "Saturn", "Earth", "Neptune"],
  ["Which planet is known as the Red Planet?", "Mars", "Venus", "Mercury", "Jupiter"],
  ["What is the chemical symbol of gold?", "Au", "Ag", "Gd", "Go"],
  ["What is the capital of Maharashtra?", "Mumbai", "Pune", "Nagpur", "Nashik"],
  ["Which is the largest ocean in the world?", "Pacific Ocean", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean"],
  ["Which is the smallest Indian state by area?", "Goa", "Sikkim", "Tripura", "Kerala"],
  ["Who discovered the law of gravity?", "Isaac Newton", "Albert Einstein", "Galileo Galilei", "Thomas Edison"],
  ["How many states are there in India?", "28", "29", "27", "30"],
  ["The headquarters of the United Nations is in?", "New York", "Geneva", "Paris", "London"],
  ["Which gas is essential for human breathing?", "Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"],
  ["Which is the hardest natural substance?", "Diamond", "Gold", "Iron", "Quartz"],
  ["Who wrote 'The Discovery of India'?", "Jawaharlal Nehru", "Mahatma Gandhi", "Rabindranath Tagore", "Dr. B.R. Ambedkar"],
  ["Which is the tallest animal in the world?", "Giraffe", "Elephant", "Camel", "Horse"],
  ["Which country is known as the 'Land of the Rising Sun'?", "Japan", "China", "Thailand", "South Korea"],
  ["How many rings are there in the Olympic symbol?", "Five", "Four", "Six", "Seven"],
  ["Who invented the telephone?", "Alexander Graham Bell", "Thomas Edison", "Nikola Tesla", "Marconi"],
  ["Sound intensity is measured in?", "Decibel", "Watt", "Hertz", "Newton"],
  ["Which is the largest hot desert in the world?", "Sahara", "Thar", "Gobi", "Kalahari"],
  ["What is the currency of the United States?", "US Dollar", "Euro", "Pound", "Peso"],
  ["What is the capital of France?", "Paris", "Berlin", "Madrid", "Rome"],
  ["Which planet is closest to the Sun?", "Mercury", "Venus", "Earth", "Mars"],
  ["Mahatma Gandhi was born at?", "Porbandar", "Ahmedabad", "Rajkot", "Delhi"],
  ["Which vitamin is obtained from sunlight?", "Vitamin D", "Vitamin A", "Vitamin C", "Vitamin B12"],
];

function build(rows, offset = 0) {
  return rows.map(([q, correct, w1, w2, w3], i) => {
    const pos = (i + offset) % 4; // rotate where the right answer sits
    const opts = [w1, w2, w3];
    opts.splice(pos, 0, correct);
    return { q, opts, answer: "ABCD"[pos] };
  });
}

async function ensureBank(name, subject, description) {
  const [b] = await query("SELECT id FROM question_banks WHERE lower(name) = lower($1)", [name]);
  if (b) return b.id;
  const [n] = await query(
    "INSERT INTO question_banks (name, subject, description, status) VALUES ($1, $2, $3, 'published') RETURNING id",
    [name, subject, description]
  );
  return n.id;
}

async function fill(bankId, items, limit = 50) {
  const [{ count }] = await query("SELECT COUNT(*) FROM questions WHERE bank_id = $1", [bankId]);
  let have = Number(count);
  const existing = new Set((await query("SELECT question_text FROM questions WHERE bank_id = $1", [bankId])).map((r) => r.question_text.trim().toLowerCase()));
  let added = 0;
  for (const it of items) {
    if (have >= limit) break;
    if (existing.has(it.q.trim().toLowerCase())) continue;
    await query(
      `INSERT INTO questions (bank_id, question_text, option_a, option_b, option_c, option_d, correct_answer, marks, difficulty, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 2, 'medium', 'published')`,
      [bankId, it.q, ...it.opts, it.answer]
    );
    have += 1;
    added += 1;
  }
  return { added, total: have };
}

(async () => {
  try {
    const eco = await ensureBank("Economics", "Economics", "Economics question bank");
    const cost = await ensureBank("Costing", "Costing", "Cost accounting question bank");
    const gk = await ensureBank("JCA Entrance - General", "General Knowledge", "General knowledge question bank");
    console.log("Economics", await fill(eco, build(ECONOMICS)));
    console.log("Costing", await fill(cost, build(COSTING, 1)));
    console.log("General Knowledge", await fill(gk, build(GK, 2)));
    console.log(await query("SELECT b.name, COUNT(q.id) n FROM question_banks b LEFT JOIN questions q ON q.bank_id = b.id GROUP BY b.id ORDER BY b.id"));
  } catch (e) {
    console.error("FAILED", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
