import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query } from 'firebase/firestore';
import { CheckCircle, XCircle, Loader2, AlertCircle, FileText, Upload, Building, CreditCard, ShieldCheck, UserCircle, Briefcase, FileSignature, LogOut, Check } from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'sap-vendor-app';

// --- Helper Components ---
const SectionCard = ({ title, icon: Icon, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
      <Icon className="w-5 h-5 text-indigo-600" />
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
    </div>
    <div className="p-6">
      {children}
    </div>
  </div>
);

const Label = ({ children, required }) => (
  <label className="block text-sm font-medium text-slate-700 mb-1">
    {children} {required && <span className="text-red-500">*</span>}
  </label>
);

const Input = ({ ...props }) => (
  <input
    {...props}
    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
      props.disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-300'
    } ${props.className || ''}`}
  />
);

const Select = ({ children, ...props }) => (
  <select
    {...props}
    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
      props.disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-300'
    } ${props.className || ''}`}
  >
    {children}
  </select>
);

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'error' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-green-100 border-green-400 text-green-700';
  const Icon = type === 'error' ? AlertCircle : CheckCircle;

  return (
    <div className={`fixed bottom-4 right-4 flex items-center gap-2 px-4 py-3 rounded border shadow-lg z-50 ${bg}`}>
      <Icon className="w-5 h-5" />
      <span className="font-medium">{message}</span>
    </div>
  );
};

// --- Main Application ---
export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('Initiator'); // 'Initiator' or 'Technical Head'
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Form State
  const initialFormState = {
    // Compulsory
    companyCode: 'DFCCIL- 1000',
    accountGroup: '',
    purchaseOrg: '',
    // General
    title: '', vendorName: '', cin: '', searchTerm1: '', searchTerm2: '',
    houseNo: '', street: '', city: '', postalCode: '', region: '', country: 'IN',
    email: '', contactNumber: '',
    // Compliance
    panNotAvailable: false, pan: '', gstin: '', gstCategory: '', industry: '',
    msmeStatus: 'No', msmeRegNo: '', financialYear: '', socialCategory: '', gender: '',
    // Accounting
    paymentTerms: '', paymentMethod: '', reconAccount: '',
    ifsc: '', bankAccountNo: '', accountHolderName: '',
    // Attachments (Simulated state)
    chkCancelledCheque: false, chkPan: false, chkGst: false, chkMsme: false, chkInc: false,
    fileLoa: null, fileBank: null,
    // Creator Info
    empName: '', empId: '', requestDept: '', purpose: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  
  // Validation States
  const [gstinStatus, setGstinStatus] = useState(null); // 'checking', 'duplicate', 'unique'
  const [cinVerification, setCinVerification] = useState(null); // 'verifying', 'valid', 'invalid'
  const [ifscStatus, setIfscStatus] = useState(null); // 'valid', 'invalid'

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // We use public path so Technical Head can see Initiator's submissions
    const vendorsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vendors');
    const q = query(vendorsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const v = [];
      snapshot.forEach((doc) => {
        v.push({ id: doc.id, ...doc.data() });
      });
      // Sort newest first
      v.sort((a, b) => b.createdAt - a.createdAt);
      setVendors(v);
      setLoading(false);
    }, (err) => {
      console.error("Firestore error:", err);
      setLoading(false);
      showToast("Failed to load data.", "error");
    });

    return () => unsubscribe();
  }, [user]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  // --- Handlers ---
  const handleInputChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    
    if (type === 'file') {
      setFormData(prev => ({ ...prev, [name]: files[0] ? files[0].name : null }));
    } else if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
      // Special logic for PAN not available
      if (name === 'panNotAvailable' && checked) {
        setFormData(prev => ({ ...prev, pan: '' }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // --- Dynamic Validations ---
  const checkGSTINDuplicate = () => {
    if (!formData.gstin) {
      setGstinStatus(null);
      return;
    }
    setGstinStatus('checking');
    setTimeout(() => {
      const isDuplicate = vendors.some(v => v.gstin === formData.gstin);
      setGstinStatus(isDuplicate ? 'duplicate' : 'unique');
    }, 600); // Simulate network latency
  };

  const verifyCINandGSTIN = () => {
    if (!formData.vendorName || (!formData.cin && !formData.gstin)) {
      showToast("Please enter Vendor Name and CIN/GSTIN to verify.", "error");
      return;
    }
    setCinVerification('verifying');
    // Simulate API call to MCA/GST portal
    setTimeout(() => {
      // Mock logic: If name is 'fake', it fails. Otherwise passes.
      if (formData.vendorName.toLowerCase().includes('fail')) {
        setCinVerification('invalid');
        showToast("Details do not match official records.", "error");
      } else {
        setCinVerification('valid');
        showToast("Details verified successfully.", "success");
      }
    }, 1500);
  };

  const checkIFSC = (val) => {
    const ifscCode = val.toUpperCase();
    setFormData(prev => ({ ...prev, ifsc: ifscCode }));
    
    if (ifscCode.length === 0) {
      setIfscStatus(null);
      return;
    }

    // Standard Indian IFSC Regex: 4 letters, 0, 6 alphanumeric
    const regex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (regex.test(ifscCode)) {
      setIfscStatus('valid');
    } else {
      setIfscStatus('invalid');
    }
  };

  // --- Submission ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (gstinStatus === 'duplicate') {
      showToast("Cannot submit: Duplicate GSTIN found.", "error");
      return;
    }
    if (ifscStatus === 'invalid') {
      showToast("Cannot submit: Invalid IFSC code.", "error");
      return;
    }
    if (!formData.fileLoa || !formData.fileBank) {
      showToast("Please upload mandatory files (LOA and Bank Details).", "error");
      return;
    }

    try {
      const vendorsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vendors');
      await addDoc(vendorsRef, {
        ...formData,
        status: 'Pending',
        initiatorId: user.uid,
        createdAt: Date.now()
      });
      showToast("Vendor created successfully and sent for approval.");
      setFormData(initialFormState);
      setGstinStatus(null);
      setCinVerification(null);
      setIfscStatus(null);
    } catch (err) {
      console.error(err);
      showToast("Error submitting form.", "error");
    }
  };

  const handleAction = async (id, action) => {
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vendors', id);
      await updateDoc(docRef, { status: action });
      showToast(`Vendor ${action.toLowerCase()} successfully.`);
    } catch (err) {
      console.error(err);
      showToast("Error updating vendor status.", "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-12">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="bg-indigo-900 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building className="w-6 h-6 text-indigo-300" />
            <h1 className="text-xl font-bold tracking-tight">SAP Vendor Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-indigo-800 rounded-md px-3 py-1.5 border border-indigo-700">
              <UserCircle className="w-5 h-5 text-indigo-300" />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="bg-transparent text-sm font-medium text-white focus:outline-none cursor-pointer"
              >
                <option value="Initiator" className="text-slate-900">Initiator Role</option>
                <option value="Technical Head" className="text-slate-900">Technical Head Role</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* INITIATOR VIEW */}
        {role === 'Initiator' && (
          <div className="space-y-8">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">New Vendor Request</h2>
                <p className="text-slate-500 mt-1">Fill the details to create a new vendor in SAP.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* 1. Compulsory Info */}
              <SectionCard title="Compulsory Information" icon={Briefcase}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <Label required>Company Code</Label>
                    <Input name="companyCode" value={formData.companyCode} disabled />
                  </div>
                  <div>
                    <Label required>Account Group</Label>
                    <Select name="accountGroup" value={formData.accountGroup} onChange={handleInputChange} required>
                      <option value="">Select Group</option>
                      <option value="Z001">Z001 - Consultants</option>
                      <option value="Z002">Z002 - Project Contractor</option>
                      <option value="Z004">Z004 - General Vendor</option>
                      <option value="Z005">Z005 - Foreign Vendor</option>
                      <option value="Z007">Z007 - One-time vend.</option>
                      <option value="Z008">Z008 - Employee Vendor</option>
                      <option value="Z010">Z010 - FI Vendors</option>
                      <option value="Z013">Z013 - Lease Vendor</option>
                      <option value="Z014">Z014 - SLAO Vendor</option>
                    </Select>
                  </div>
                  <div>
                    <Label required>Purchase Organisation</Label>
                    <Input name="purchaseOrg" value={formData.purchaseOrg} onChange={handleInputChange} required placeholder="e.g., P001" />
                  </div>
                </div>
              </SectionCard>

              {/* 2. General Info */}
              <SectionCard title="General Information" icon={UserCircle}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <Label required>Title</Label>
                    <Select name="title" value={formData.title} onChange={handleInputChange} required>
                      <option value="">Select</option>
                      <option value="Mr">Mr.</option>
                      <option value="Ms">Ms.</option>
                      <option value="Mrs">Mrs.</option>
                      <option value="Company">Company</option>
                      <option value="Dr">Dr.</option>
                    </Select>
                  </div>
                  <div className="lg:col-span-2">
                    <Label required>Vendor Name (Legal Name)</Label>
                    <Input name="vendorName" value={formData.vendorName} onChange={handleInputChange} required placeholder="Enter full legal name" />
                  </div>
                  
                  <div>
                    <Label>Search Term 1 <span className="text-red-500">*</span></Label>
                    <Input name="searchTerm1" value={formData.searchTerm1} onChange={handleInputChange} required />
                  </div>
                  <div>
                    <Label>Search Term 2 <span className="text-red-500">*</span></Label>
                    <Input name="searchTerm2" value={formData.searchTerm2} onChange={handleInputChange} required />
                  </div>
                  <div>
                    <Label>Email ID <span className="text-red-500">*</span></Label>
                    <Input type="email" name="email" value={formData.email} onChange={handleInputChange} required />
                  </div>
                  <div>
                    <Label>Contact Number <span className="text-red-500">*</span></Label>
                    <Input name="contactNumber" value={formData.contactNumber} onChange={handleInputChange} required />
                  </div>
                </div>

                <div className="mt-6 border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wider">Address Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <Label required>House No.</Label>
                      <Input name="houseNo" value={formData.houseNo} onChange={handleInputChange} required />
                    </div>
                    <div className="md:col-span-2">
                      <Label required>Street</Label>
                      <Input name="street" value={formData.street} onChange={handleInputChange} required />
                    </div>
                    <div>
                      <Label required>City</Label>
                      <Input name="city" value={formData.city} onChange={handleInputChange} required />
                    </div>
                    <div>
                      <Label required>Postal Code</Label>
                      <Input name="postalCode" value={formData.postalCode} onChange={handleInputChange} required />
                    </div>
                    <div>
                      <Label required>Region (State)</Label>
                      <Input name="region" value={formData.region} onChange={handleInputChange} required />
                    </div>
                    <div>
                      <Label required>Country</Label>
                      <Input name="country" value={formData.country} disabled />
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* 3. Compliance Info */}
              <SectionCard title="Compliance Information" icon={ShieldCheck}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                   <div>
                    <Label required>CIN / LLPIN (For Company)</Label>
                    <Input name="cin" value={formData.cin} onChange={handleInputChange} required />
                  </div>
                  <div>
                    <Label required>GSTIN</Label>
                    <div className="relative">
                      <Input 
                        name="gstin" 
                        value={formData.gstin} 
                        onChange={handleInputChange} 
                        onBlur={checkGSTINDuplicate}
                        required 
                        className={gstinStatus === 'duplicate' ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
                      />
                      {gstinStatus === 'checking' && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-slate-400" />}
                      {gstinStatus === 'unique' && <CheckCircle className="absolute right-3 top-2.5 w-4 h-4 text-green-500" />}
                      {gstinStatus === 'duplicate' && <XCircle className="absolute right-3 top-2.5 w-4 h-4 text-red-500" />}
                    </div>
                    {gstinStatus === 'duplicate' && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><XCircle className="w-3 h-3"/> Duplicate GSTIN found.</p>}
                  </div>

                  {/* Verification Action */}
                  <div className="md:col-span-2 flex items-center gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div className="flex-1">
                      <p className="text-sm text-blue-800 font-medium">Verify Identity</p>
                      <p className="text-xs text-blue-600">Cross-check CIN/GSTIN with Vendor Name dynamically.</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={verifyCINandGSTIN}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                      disabled={cinVerification === 'verifying'}
                    >
                      {cinVerification === 'verifying' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify Details'}
                    </button>
                    {cinVerification === 'valid' && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded border border-green-300 flex items-center gap-1"><Check className="w-3 h-3"/> Match Found</span>}
                    {cinVerification === 'invalid' && <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded border border-red-300 flex items-center gap-1"><XCircle className="w-3 h-3"/> Mismatch</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <Label required={!formData.panNotAvailable}>PAN Number</Label>
                    <Input name="pan" value={formData.pan} onChange={handleInputChange} disabled={formData.panNotAvailable} required={!formData.panNotAvailable} />
                    <div className="mt-2 flex items-center">
                      <input type="checkbox" id="panNotAvailable" name="panNotAvailable" checked={formData.panNotAvailable} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                      <label htmlFor="panNotAvailable" className="ml-2 block text-xs text-slate-600">PAN Not available</label>
                    </div>
                  </div>
                  <div>
                    <Label>GST Vendor Category</Label>
                    <Select name="gstCategory" value={formData.gstCategory} onChange={handleInputChange}>
                      <option value="">Select Category</option>
                      <option value="Registered">Registered</option>
                      <option value="Unregistered">Unregistered</option>
                      <option value="Composite">Composite</option>
                    </Select>
                  </div>
                  <div>
                    <Label required>Industry</Label>
                    <Input name="industry" value={formData.industry} onChange={handleInputChange} required />
                  </div>
                  
                  <div>
                    <Label required>MSME Status</Label>
                    <Select name="msmeStatus" value={formData.msmeStatus} onChange={handleInputChange} required>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </Select>
                  </div>
                  <div>
                    <Label required={formData.msmeStatus === 'Yes'}>MSME Reg/Udyam No.</Label>
                    <Input name="msmeRegNo" value={formData.msmeRegNo} onChange={handleInputChange} required={formData.msmeStatus === 'Yes'} disabled={formData.msmeStatus === 'No'} />
                  </div>
                  <div>
                    <Label required>Financial Year</Label>
                    <Input name="financialYear" value={formData.financialYear} onChange={handleInputChange} placeholder="e.g., 2023-24" required />
                  </div>

                  <div>
                    <Label required>Social Category</Label>
                    <Select name="socialCategory" value={formData.socialCategory} onChange={handleInputChange} required>
                      <option value="">Select</option>
                      <option value="General">General</option>
                      <option value="OBC">OBC</option>
                      <option value="SC">SC</option>
                      <option value="ST">ST</option>
                    </Select>
                  </div>
                  <div>
                    <Label required>Gender / Type</Label>
                    <Select name="gender" value={formData.gender} onChange={handleInputChange} required>
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Company">Company</option>
                    </Select>
                  </div>
                </div>
              </SectionCard>

              {/* 4. Accounting & Banking */}
              <SectionCard title="Accounting & Banking" icon={CreditCard}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <Label required>Payment Terms</Label>
                    <Input name="paymentTerms" value={formData.paymentTerms} onChange={handleInputChange} required />
                  </div>
                  <div>
                    <Label required>Payment Method</Label>
                    <Input name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange} required />
                  </div>
                  <div>
                    <Label required>Reconciliation Account</Label>
                    <Input name="reconAccount" value={formData.reconAccount} onChange={handleInputChange} required />
                  </div>
                  
                  <div className="md:col-span-3 border-t border-slate-100 pt-6 mt-2">
                    <h4 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wider">Bank Details</h4>
                  </div>
                  
                  <div>
                    <Label required>Bank Key (IFSC Code)</Label>
                    <div className="relative">
                       <Input 
                        name="ifsc" 
                        value={formData.ifsc} 
                        onChange={(e) => checkIFSC(e.target.value)} 
                        required 
                        maxLength={11}
                        className={ifscStatus === 'invalid' ? 'border-red-500 focus:border-red-500' : (ifscStatus === 'valid' ? 'border-green-500' : '')}
                        placeholder="e.g. SBIN0001234"
                      />
                      {ifscStatus === 'valid' && <CheckCircle className="absolute right-3 top-2.5 w-4 h-4 text-green-500" />}
                      {ifscStatus === 'invalid' && <XCircle className="absolute right-3 top-2.5 w-4 h-4 text-red-500" />}
                    </div>
                    {ifscStatus === 'valid' && <p className="text-xs text-green-600 mt-1 font-medium">Valid IFSC format</p>}
                    {ifscStatus === 'invalid' && <p className="text-xs text-red-500 mt-1">Must be 11 alphanumeric characters</p>}
                  </div>
                  <div>
                    <Label required>Bank Account Number</Label>
                    <Input type="number" name="bankAccountNo" value={formData.bankAccountNo} onChange={handleInputChange} required />
                  </div>
                  <div>
                    <Label required>Account Holder Name</Label>
                    <Input name="accountHolderName" value={formData.accountHolderName} onChange={handleInputChange} required />
                  </div>
                </div>
              </SectionCard>

              {/* 5. Attachments & Creator Info */}
              <SectionCard title="Attachments & Creator Info" icon={FileSignature}>
                <div className="mb-6 bg-yellow-50 p-4 rounded-md border border-yellow-200">
                  <h4 className="text-sm font-semibold text-yellow-800 mb-2">Checklist of Documents Submitted</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {['CancelledCheque', 'Pan', 'Gst', 'Msme', 'Inc'].map(doc => (
                      <div key={doc} className="flex items-center">
                        <input type="checkbox" id={`chk${doc}`} name={`chk${doc}`} checked={formData[`chk${doc}`]} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                        <label htmlFor={`chk${doc}`} className="ml-2 block text-sm text-slate-700">{doc.replace(/([A-Z])/g, ' $1').trim()} {['Msme'].includes(doc) ? '' : '*'}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50 hover:bg-slate-100 transition-colors">
                    <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                    <Label required>Letter Of Award / PO / Contract</Label>
                    <input type="file" name="fileLoa" onChange={handleInputChange} required className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                  </div>
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50 hover:bg-slate-100 transition-colors">
                    <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                    <Label required>Bank Details Document</Label>
                    <input type="file" name="fileBank" onChange={handleInputChange} required className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wider">Creator Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div>
                      <Label>Employee Name</Label>
                      <Input name="empName" value={formData.empName} onChange={handleInputChange} />
                    </div>
                    <div>
                      <Label>Employee ID</Label>
                      <Input name="empId" value={formData.empId} onChange={handleInputChange} />
                    </div>
                    <div>
                      <Label>Requesting Dept.</Label>
                      <Input name="requestDept" value={formData.requestDept} onChange={handleInputChange} />
                    </div>
                    <div>
                      <Label>Purpose</Label>
                      <Input name="purpose" value={formData.purpose} onChange={handleInputChange} />
                    </div>
                  </div>
                </div>
              </SectionCard>

              <div className="flex justify-end pt-4 pb-12">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                >
                  <FileText className="w-5 h-5" /> Submit Vendor Request
                </button>
              </div>
            </form>

            {/* List of submitted vendors for initiator */}
            <div className="mt-12 mb-12">
              <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">My Submitted Requests</h3>
              <div className="bg-white rounded-lg shadow border border-slate-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Vendor Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">GSTIN / CIN</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {vendors.filter(v => v.initiatorId === user?.uid).map(vendor => (
                      <tr key={vendor.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {new Date(vendor.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {vendor.vendorName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {vendor.gstin} <br/><span className="text-xs text-slate-400">{vendor.cin}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${vendor.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                            ${vendor.status === 'Approved' ? 'bg-green-100 text-green-800' : ''}
                            ${vendor.status === 'Rejected' ? 'bg-red-100 text-red-800' : ''}
                          `}>
                            {vendor.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {vendors.filter(v => v.initiatorId === user?.uid).length === 0 && (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-slate-500 text-sm">
                          No requests submitted yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TECHNICAL HEAD VIEW */}
        {role === 'Technical Head' && (
          <div className="space-y-6 pb-12">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Pending Approvals</h2>
              <p className="text-slate-500 mt-1">Review and approve vendor creation requests.</p>
            </div>

            <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
              <ul className="divide-y divide-slate-200">
                {vendors.filter(v => v.status === 'Pending').map(vendor => (
                  <li key={vendor.id} className="p-6 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="text-lg font-bold text-slate-900 truncate">{vendor.vendorName}</h4>
                          <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded font-medium border border-indigo-200">
                            {vendor.accountGroup}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm text-slate-500 mt-3">
                          <p><span className="font-medium text-slate-700">GSTIN:</span> {vendor.gstin}</p>
                          <p><span className="font-medium text-slate-700">CIN:</span> {vendor.cin}</p>
                          <p><span className="font-medium text-slate-700">IFSC:</span> {vendor.ifsc}</p>
                          <p><span className="font-medium text-slate-700">Email:</span> {vendor.email}</p>
                          <p className="md:col-span-2 truncate"><span className="font-medium text-slate-700">Address:</span> {vendor.houseNo}, {vendor.street}, {vendor.city}</p>
                        </div>
                        <div className="mt-4 flex items-center gap-4 text-xs font-medium text-slate-500">
                          <span className="flex items-center gap-1"><FileText className="w-4 h-4"/> LOA: {vendor.fileLoa || 'Missing'}</span>
                          <span className="flex items-center gap-1"><Building className="w-4 h-4"/> Bank: {vendor.fileBank || 'Missing'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleAction(vendor.id, 'Rejected')}
                          className="px-4 py-2 bg-white border border-red-300 text-red-700 hover:bg-red-50 font-medium rounded shadow-sm text-sm transition-colors flex items-center gap-1"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                        <button
                          onClick={() => handleAction(vendor.id, 'Approved')}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded shadow-sm text-sm transition-colors flex items-center gap-1"
                        >
                          <CheckCircle className="w-4 h-4" /> Approve
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                {vendors.filter(v => v.status === 'Pending').length === 0 && (
                  <li className="p-12 text-center text-slate-500">
                    <CheckCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p className="text-lg font-medium text-slate-600">All caught up!</p>
                    <p>No pending vendor requests to review.</p>
                  </li>
                )}
              </ul>
            </div>
            
            {/* History for Technical Head */}
            <div className="mt-8">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Approval History</h3>
              <div className="bg-white rounded-lg shadow border border-slate-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Vendor Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">GSTIN</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {vendors.filter(v => v.status !== 'Pending').map(vendor => (
                      <tr key={vendor.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{vendor.vendorName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{vendor.gstin}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${vendor.status === 'Approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                          `}>
                            {vendor.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {vendors.filter(v => v.status !== 'Pending').length === 0 && (
                      <tr><td colSpan="3" className="px-6 py-4 text-center text-slate-500 text-sm">No history available.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}