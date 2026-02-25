import React, { useState } from 'react';
import axios from 'axios';
import { Save, Send, FileText, CheckSquare, HelpCircle, TrendingUp, AlertTriangle, Loader } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://disabled-injection-investing-attempts.trycloudflare.com';

export default function ConsultationForm() {
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const [formData, setFormData] = useState({
        // Section A
        structure: '',
        structureReason: '',
        // Section B
        taxRate: '',
        profitTax: '',
        partnerTax: '',
        profitShareTax: '',
        salaryScenario: '',
        presumptiveEligible: '',
        presumptiveTurnover: '',
        presumptiveProfit: '',
        presumptiveBenefit: '',
        presumptiveDrawback: '',
        taxSaving80C: '',
        taxSaving80D: '',
        taxSavingHRA: '',
        taxSavingExp: '',
        taxSavingDep: '',
        taxSavingFamily: '',
        taxSavingOther: '',
        expRent: '',
        expPhone: '',
        expInternet: '',
        expLaptop: '',
        expSoftware: '',
        expTravel: '',
        expPackaging: '',
        expMarketing: '',
        expShipping: '',
        expTea: '',
        expOther: '',
        // Section C
        gstRate: '',
        gstInput: '',
        gstMaximize: '',
        gstFreq: '',
        gstMissed: '',
        // Section D
        // ... (We can group these or keep flat)
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? (checked ? 'Yes' : 'No') : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/api/consultation/submit`, formData);
            if (res.data.success) {
                setSubmitted(true);
                window.scrollTo(0, 0);
            }
        } catch (error) {
            alert('Failed to send consultation request. Please try again.');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="max-w-2xl mx-auto mt-20 text-center p-12 bg-green-500/10 rounded-3xl border border-green-500/20 backdrop-blur-xl">
                <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30">
                    <CheckSquare size={40} />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">Consultation Request Sent!</h2>
                <p className="text-gray-400 text-lg">We have received your details and will get back to you shortly.</p>
                <div className="mt-8">
                    <button onClick={() => window.location.reload()} className="text-green-400 hover:text-green-300 font-medium">
                        Submit Another Response
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto pb-20 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">CA Consultation Form</h1>
                    <p className="text-gray-500 text-sm mt-1">GRLHOOD - Business Structure & Tax Planning</p>
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                >
                    {loading ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
                    {loading ? 'Sending...' : 'Submit Form'}
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">

                {/* SECTION A: BUSINESS STRUCTURE */}
                <div className="panel-dark space-y-6">
                    <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2"><BoxIcon /> SECTION A: BUSINESS STRUCTURE</h2>

                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-gray-300">1. Best structure for us?</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {['Proprietorship', 'Partnership Firm', 'LLP', 'Pvt Ltd'].map(opt => (
                                <label key={opt} className="flex items-center gap-2 p-3 bg-black/40 rounded-xl border border-white/10 cursor-pointer hover:border-cyan-500/50 transition-colors">
                                    <input type="radio" name="structure" value={opt} onChange={handleChange} className="accent-cyan-400" />
                                    <span className="text-sm">{opt}</span>
                                </label>
                            ))}
                            <input
                                name="structureOther"
                                placeholder="Other..."
                                onChange={handleChange}
                                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-300">Why this structure?</label>
                        <textarea
                            name="structureReason"
                            rows={3}
                            onChange={handleChange}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500 min-h-[100px]"
                            placeholder="Your reasoning..."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">2. Partnership Firm (if recommended)</h3>
                            <QuestionRow question="Registration process?" name="partnerRegProcess" onChange={handleChange} />
                            <QuestionRow question="Documents required?" name="partnerDocs" onChange={handleChange} />
                            <QuestionRow question="Timeline?" name="partnerTimeline" onChange={handleChange} />
                            <QuestionRow question="Registration cost?" name="partnerCost" onChange={handleChange} />
                            <QuestionRow question="Can we add more partners later?" name="partnerAdd" onChange={handleChange} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">3. Partnership Deed - What to include?</h3>
                            <QuestionRow question="Profit sharing ratio (70-30)" name="deedRatio" onChange={handleChange} placeholder="Recommendation" />
                            <QuestionRow question="Salary clause - Yes/No?" name="deedSalary" onChange={handleChange} placeholder="Yes/No" />
                            <QuestionRow question="Rec. salary amounts?" name="deedSalaryAmt" onChange={handleChange} />
                            <QuestionRow question="Interest on capital?" name="deedInterest" onChange={handleChange} />
                            <QuestionRow question="Interest %?" name="deedInterestPct" onChange={handleChange} />
                            <QuestionRow question="Exit clause?" name="deedExit" onChange={handleChange} />
                        </div>
                    </div>
                </div>

                {/* SECTION B: TAX PLANNING */}
                <div className="panel-dark space-y-6">
                    <h2 className="text-xl font-bold text-green-400 flex items-center gap-2"><TrendingUp /> SECTION B: TAX PLANNING</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">4. Tax Structure</h3>
                            <QuestionRow question="Tax rate applicable?" name="taxRate" onChange={handleChange} />
                            <QuestionRow question="How is profit taxed?" name="taxProfit" onChange={handleChange} />
                            <QuestionRow question="How is partner salary taxed?" name="taxSalary" onChange={handleChange} />
                            <QuestionRow question="Is profit share taxable?" name="taxShare" onChange={handleChange} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">5. Salary vs No Salary</h3>
                            <div className="bg-black/40 p-4 rounded-xl border border-white/10 mb-4">
                                <div className="grid grid-cols-3 gap-2 text-xs font-bold text-gray-500 mb-2">
                                    <span>Scenario</span>
                                    <span>Tax Amount</span>
                                    <span>In-Hand</span>
                                </div>
                                <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2 items-center">
                                        <span className="text-xs">No salary</span>
                                        <input name="taxNoSalAmt" onChange={handleChange} className="bg-white/5 rounded px-2 py-1 text-xs outline-none" />
                                        <input name="taxNoSalHand" onChange={handleChange} className="bg-white/5 rounded px-2 py-1 text-xs outline-none" />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 items-center">
                                        <span className="text-xs">With salary</span>
                                        <input name="taxWithSalAmt" onChange={handleChange} className="bg-white/5 rounded px-2 py-1 text-xs outline-none" />
                                        <input name="taxWithSalHand" onChange={handleChange} className="bg-white/5 rounded px-2 py-1 text-xs outline-none" />
                                    </div>
                                </div>
                            </div>
                            <textarea name="salaryRecommendation" onChange={handleChange} placeholder="Your recommendation..." className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-green-500 h-24" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-400 uppercase">6. Presumptive Taxation (44AD)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <QuestionRow question="Are we eligible?" name="presumptiveEligible" onChange={handleChange} />
                            <QuestionRow question="Turnover limit?" name="presumptiveTurnover" onChange={handleChange} />
                            <QuestionRow question="Assumed Profit %?" name="presumptiveProfit" onChange={handleChange} />
                            <QuestionRow question="Beneficial?" name="presumptiveBenefit" onChange={handleChange} />
                            <QuestionRow question="Drawbacks?" name="presumptiveDrawback" onChange={handleChange} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">7. Tax Saving Options</h3>
                            <div className="space-y-2">
                                <TaxSavingRow label="Section 80C" limit="₹1.5L" name="tax80C" onChange={handleChange} />
                                <TaxSavingRow label="Section 80D (Health)" limit="Limit?" name="tax80D" onChange={handleChange} />
                                <TaxSavingRow label="HRA / Rent" limit="Calc" name="taxHRA" onChange={handleChange} />
                                <TaxSavingRow label="Biz Expenses" limit="Actuals" name="taxExp" onChange={handleChange} />
                                <TaxSavingRow label="Depreciation" limit="Asset wise" name="taxDep" onChange={handleChange} />
                                <TaxSavingRow label="Family Salary" limit="Reasonable" name="taxFam" onChange={handleChange} />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">8. Claimable Expenses</h3>
                            <div className="space-y-2">
                                <ExpenseRow label="Office Rent" name="expRent" onChange={handleChange} />
                                <ExpenseRow label="Phone Bills" name="expPhone" onChange={handleChange} />
                                <ExpenseRow label="Internet" name="expInternet" onChange={handleChange} />
                                <ExpenseRow label="Laptops" name="expLaptop" onChange={handleChange} />
                                <ExpenseRow label="Travel" name="expTravel" onChange={handleChange} />
                                <ExpenseRow label="Ads/Marketing" name="expMarketing" onChange={handleChange} />
                                <ExpenseRow label="Tea/Snacks" name="expTea" onChange={handleChange} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION C: GST */}
                <div className="panel-dark space-y-6">
                    <h2 className="text-xl font-bold text-purple-400 flex items-center gap-2"><FileText /> SECTION C: GST</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <QuestionRow question="Current GST rate for phone cases?" name="gstRate" onChange={handleChange} />
                        <QuestionRow question="Input credit - what can we claim?" name="gstInput" onChange={handleChange} />
                        <QuestionRow question="How to maximize input credit?" name="gstMaximize" onChange={handleChange} />
                        <QuestionRow question="Filing frequency?" name="gstFreq" onChange={handleChange} />
                    </div>
                </div>

                {/* SECTION D: COMPLIANCE */}
                <div className="panel-dark space-y-6">
                    <h2 className="text-xl font-bold text-orange-400 flex items-center gap-2"><AlertTriangle /> SECTION D: COMPLIANCE</h2>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-xs text-gray-500 uppercase font-bold border-b border-white/10">
                                <tr>
                                    <th className="p-3">Task</th>
                                    <th className="p-3">Frequency</th>
                                    <th className="p-3">Due Date</th>
                                    <th className="p-3 text-right">Your Fee</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {['GST Filing', 'TDS Filing', 'Advance Tax', 'ITR Filing', 'Audit', 'ROC Filing'].map(task => (
                                    <tr key={task}>
                                        <td className="p-3 font-medium">{task}</td>
                                        <td className="p-3"><input className="bg-transparent outline-none w-full text-gray-400" placeholder="Freq..." name={`compFreq_${task}`} onChange={handleChange} /></td>
                                        <td className="p-3"><input className="bg-transparent outline-none w-full text-gray-400" placeholder="Date..." name={`compDate_${task}`} onChange={handleChange} /></td>
                                        <td className="p-3 text-right"><input className="bg-transparent outline-none w-24 text-right text-white" placeholder="₹" name={`compFee_${task}`} onChange={handleChange} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">11. Advance Tax</h3>
                            <QuestionRow question="Are we required to pay?" name="advReq" onChange={handleChange} />
                            <QuestionRow question="Quarterly dates?" name="advDates" onChange={handleChange} />
                            <QuestionRow question="How to calculate?" name="advCalc" onChange={handleChange} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">12. Audit Requirement</h3>
                            <QuestionRow question="When is audit mandatory?" name="auditMandatory" onChange={handleChange} />
                            <QuestionRow question="Turnover limit?" name="auditLimit" onChange={handleChange} />
                            <QuestionRow question="Audit cost?" name="auditCost" onChange={handleChange} />
                        </div>
                    </div>
                </div>

                {/* SECTION E: E-COMMERCE */}
                <div className="panel-dark space-y-6">
                    <h2 className="text-xl font-bold text-blue-400 flex items-center gap-2"><CheckSquare /> SECTION E: E-COMMERCE SPECIFIC</h2>
                    <div className="text-sm text-gray-400 bg-black/30 p-4 rounded-xl mb-4">
                        <p>Model: Online Phone Cases (Shopify). 60% COD, 40% Prepaid. Supplier invoices with 7-day terms.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <QuestionRow question="COD vs Prepaid - any tax difference?" name="ecomCodDiff" onChange={handleChange} />
                        <QuestionRow question="Shiprocket remittance - how to record?" name="ecomRemittance" onChange={handleChange} />
                        <QuestionRow question="RTO (return) losses - can we claim?" name="ecomRto" onChange={handleChange} />
                        <QuestionRow question="Marketplace fees - GST input available?" name="ecomFees" onChange={handleChange} />
                    </div>
                </div>

                {/* SECTION F & G: FUTURE & FEES */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="panel-dark space-y-4">
                        <h2 className="text-xl font-bold text-white mb-4">SECTION F: FUTURE</h2>
                        <QuestionRow question="Turnover to change structure?" name="futureScale" onChange={handleChange} />
                        <QuestionRow question="When does Pvt Ltd make sense?" name="futurePvt" onChange={handleChange} />
                        <QuestionRow question="LLP vs Partnership?" name="futureLlp" onChange={handleChange} />
                    </div>
                    <div className="panel-dark space-y-4">
                        <h2 className="text-xl font-bold text-white mb-4">SECTION G: YOUR FEES</h2>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-gray-500 uppercase font-bold">
                                <span>Service</span>
                                <div className="flex gap-4"><span>Monthly</span><span>Yearly</span></div>
                            </div>
                            {['Bookkeeping', 'GST Filing', 'ITR Filing', 'Advisory', 'Registration'].map(s => (
                                <div key={s} className="flex justify-between items-center bg-black/20 p-2 rounded">
                                    <span className="text-sm">{s}</span>
                                    <div className="flex gap-2">
                                        <input className="w-20 bg-transparent text-right text-sm outline-none" placeholder="-" />
                                        <input className="w-20 bg-transparent text-right text-sm outline-none" placeholder="-" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* SECTION H: OTHER */}
                <div className="panel-dark space-y-4">
                    <h2 className="text-xl font-bold text-white mb-4">SECTION H: OTHER</h2>
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-300">17. Things we don't know but should know?</label>
                        <textarea rows={3} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-300">18. Common mistakes to avoid?</label>
                        <textarea rows={3} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30" />
                    </div>
                </div>

                <div className="flex justify-end pt-8">
                    <button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-500 text-white px-12 py-4 rounded-xl font-bold text-lg flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20">
                        <Send size={24} /> Submit Consultation Response
                    </button>
                </div>

            </form>
        </div>
    );
}

// Helper Components
const BoxIcon = () => <div className="w-5 h-5 bg-cyan-500/20 rounded border border-cyan-500/50" />;

const QuestionRow = ({ question, name, onChange, placeholder = "Answer..." }) => (
    <div className="space-y-1 mb-3">
        <label className="text-xs text-gray-400 block">{question}</label>
        <input
            name={name}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors"
        />
    </div>
);

const TaxSavingRow = ({ label, limit, name, onChange }) => (
    <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg">
        <div className="flex-1">
            <div className="text-sm text-gray-300">{label}</div>
            <div className="text-[10px] text-gray-600">Limit: {limit}</div>
        </div>
        <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 flex items-center gap-1 cursor-pointer">
                <input type="checkbox" name={`${name}_app`} onChange={onChange} /> App?
            </label>
            <input name={`${name}_advice`} onChange={onChange} placeholder="Advice" className="w-24 bg-transparent border-b border-white/10 text-xs py-1 outline-none text-right" />
        </div>
    </div>
);

const ExpenseRow = ({ label, name, onChange }) => (
    <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg">
        <span className="text-sm text-gray-300">{label}</span>
        <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 flex items-center gap-1 cursor-pointer">
                <input type="checkbox" name={`${name}_claim`} onChange={onChange} /> Claim
            </label>
            <input name={`${name}_limit`} onChange={onChange} placeholder="Limit?" className="w-16 bg-transparent border-b border-white/10 text-xs py-1 outline-none text-right" />
        </div>
    </div>
);
