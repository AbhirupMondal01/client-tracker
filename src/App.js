// Final Vercel version with bug fixes for delete and dropdown visibility
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    addDoc,
    doc,
    onSnapshot,
    updateDoc,
    deleteDoc,
    query,
    writeBatch,
    getDocs,
    orderBy
} from 'firebase/firestore';
import { Plus, Trash2, ChevronDown, FolderKanban, ServerCrash, GripVertical, Search, Bell, ChevronsLeft, ChevronsRight } from 'lucide-react';

// --- Firebase Configuration for Vercel ---
// This code correctly reads the secret keys from your Vercel project settings.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID
};

// --- Standard Onboarding Tasks ---
const STANDARD_ONBOARDING_TASKS = [
    "Kick off call", "Additional Requirement gathering", "Email to vendors for vendor integration",
    "Sign up the account on sell.do", "Setup account related details", "Schedule and conduct Admin Training",
    "Schedule and conduct User Training", "Handover client to support or Account Manager"
];

// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // --- Firebase Initialization and Authentication ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestoreDb);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    await signInAnonymously(firebaseAuth);
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase initialization error:", e);
            setError("There was a problem initializing the application.");
            setLoading(false);
        }
    }, []);

    // --- Data Fetching (Clients) ---
    useEffect(() => {
        if (!isAuthReady || !db || !userId) return;
        setLoading(true);
        const clientsCollectionPath = `users/${userId}/clients`;
        const q = query(collection(db, clientsCollectionPath), orderBy("createdAt", "asc"));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const clientsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setClients(clientsData);
            
            if (selectedClient && !clientsData.some(c => c.id === selectedClient.id)) {
                setSelectedClient(clientsData.length > 0 ? clientsData[0] : null);
            } else if (!selectedClient && clientsData.length > 0) {
                setSelectedClient(clientsData[0]);
            } else if (clientsData.length === 0) {
                setSelectedClient(null);
            }

            setLoading(false);
        }, (err) => {
            console.error("Error fetching clients:", err);
            setError("Failed to load client data.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, userId]);

    // --- CRUD Operations ---
    const addClient = async (clientName) => {
        if (clientName.trim() === '' || !db || !userId) return;
        try {
            const batch = writeBatch(db);
            const clientsCollectionPath = `users/${userId}/clients`;
            const newClientRef = doc(collection(db, clientsCollectionPath));
            batch.set(newClientRef, { name: clientName.trim(), createdAt: new Date() });

            const tasksCollectionPath = `users/${userId}/clients/${newClientRef.id}/tasks`;
            STANDARD_ONBOARDING_TASKS.forEach(taskName => {
                const newTaskRef = doc(collection(db, tasksCollectionPath));
                batch.set(newTaskRef, { name: taskName, status: 'Pending', createdAt: new Date() });
            });
            await batch.commit();
            const newClientData = { id: newClientRef.id, name: clientName.trim(), createdAt: new Date() };
            setClients(prevClients => [...prevClients, newClientData]);
            setSelectedClient(newClientData);
        } catch (e) {
            console.error("Error adding client:", e);
            setError("Failed to add new client.");
        }
    };

    const deleteClient = async (clientId) => {
        if (!db || !userId) return;
        try {
            const batch = writeBatch(db);
            const clientDocRef = doc(db, `users/${userId}/clients`, clientId);
            
            const tasksCollectionPath = `users/${userId}/clients/${clientId}/tasks`;
            const tasksSnapshot = await getDocs(query(collection(db, tasksCollectionPath)));
            tasksSnapshot.forEach(taskDoc => batch.delete(taskDoc.ref));
            
            batch.delete(clientDocRef);
            await batch.commit();
        } catch (e) {
            console.error("Error deleting client:", e);
            setError("Failed to delete client.");
        }
    };
    
    // --- Render Logic ---
    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} />;
    
    return (
        <div className="flex h-screen bg-slate-900 text-white font-sans overflow-hidden">
            <Sidebar
                clients={clients}
                selectedClient={selectedClient}
                setSelectedClient={setSelectedClient}
                onAddClient={addClient}
                isCollapsed={isSidebarCollapsed}
                setIsCollapsed={setIsSidebarCollapsed}
            />
            <main className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'md:ml-72'}`}>
                <Header client={selectedClient}/>
                <div className="flex-1 p-6 lg:p-8 overflow-y-auto">
                    {selectedClient ? (
                        <ClientDetail
                            key={selectedClient.id}
                            client={selectedClient}
                            db={db}
                            userId={userId}
                            onDeleteClient={deleteClient}
                        />
                    ) : (
                        <EmptyState />
                    )}
                </div>
            </main>
        </div>
    );
}

// --- Sidebar Component ---
const Sidebar = ({ clients, selectedClient, setSelectedClient, onAddClient, isCollapsed, setIsCollapsed }) => {
    const [newClientName, setNewClientName] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleAddClient = () => {
        if (newClientName.trim()) {
            onAddClient(newClientName);
            setNewClientName('');
            setIsAdding(false);
        }
    };

    return (
        <aside className={`fixed top-0 left-0 h-full bg-slate-900/70 backdrop-blur-lg border-r border-slate-700/50 flex flex-col z-30 transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-72'}`}>
            <div className={`p-4 border-b border-slate-800 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!isCollapsed && (
                    <img
                        src="https://www.sell.do/assets/selldo_v3/logo-da9a7228f4926c9ee96bf0bbc9664a44.png"
                        alt="App Logo"
                        className="h-8"
                        onError={(e) => { e.target.onerror = null; e.target.style.display='none'; }}
                    />
                )}
                <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
                    {isCollapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
                </button>
            </div>
            <div className="p-4">
                <button onClick={() => setIsAdding(!isAdding)} className={`w-full flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 rounded-lg shadow-lg hover:bg-indigo-700 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500 ${isCollapsed ? 'justify-center px-2' : 'justify-center px-4'}`}>
                    <Plus size={20} />
                    {!isCollapsed && <span>New Client</span>}
                </button>
                {isAdding && !isCollapsed && (
                    <div className="mt-3">
                        <input
                            type="text"
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddClient()}
                            placeholder="Client Name..."
                            className="w-full p-2 bg-slate-800 border border-slate-700 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                        />
                    </div>
                )}
            </div>
            <nav className="flex-1 px-4 pb-4 overflow-y-auto">
                {!isCollapsed && <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Clients</h2>}
                <ul className="space-y-1">
                    {clients.map(client => (
                        <li key={client.id} title={isCollapsed ? client.name : ''}>
                            <a
                                href="#"
                                onClick={(e) => { e.preventDefault(); setSelectedClient(client); }}
                                className={`flex items-center gap-3 py-2 rounded-md text-sm font-medium transition-colors ${selectedClient?.id === client.id ? 'bg-indigo-500/20 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'} ${isCollapsed ? 'justify-center px-2' : 'px-3'}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${selectedClient?.id === client.id ? 'bg-cyan-400' : 'bg-slate-600'}`}></span>
                                {!isCollapsed && <span>{client.name}</span>}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
        </aside>
    );
};

// --- Header Component ---
const Header = ({ client }) => {
    return (
        <header className="flex-shrink-0 bg-slate-900/50 backdrop-blur-lg border-b border-slate-800/50 p-4 flex items-center justify-between z-20">
            <div>
                <h2 className="text-xl font-bold text-white">{client ? client.name : 'Dashboard'}</h2>
                <p className="text-sm text-slate-400">{client ? 'Onboarding Details' : 'Please select a client'}</p>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative hidden md:block">
                    <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" />
                    <input type="text" placeholder="Search..." className="w-full max-w-xs bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" />
                </div>
                <button className="p-2 rounded-full text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
                    <Bell size={20} />
                </button>
            </div>
        </header>
    );
};

// --- ClientDetail Component ---
const ClientDetail = ({ client, db, userId, onDeleteClient }) => {
    const [tasks, setTasks] = useState([]);
    const [newTaskName, setNewTaskName] = useState('');

    const addTask = async () => {
        if (newTaskName.trim() === '') return;
        const tasksCollectionPath = `users/${userId}/clients/${client.id}/tasks`;
        await addDoc(collection(db, tasksCollectionPath), { name: newTaskName.trim(), status: 'Pending', createdAt: new Date() });
        setNewTaskName('');
    };

    const updateTaskStatus = async (taskId, newStatus) => {
        const taskDocRef = doc(db, `users/${userId}/clients/${client.id}/tasks`, taskId);
        await updateDoc(taskDocRef, { status: newStatus });
    };

    const deleteTask = async (taskId) => {
        const taskDocRef = doc(db, `users/${userId}/clients/${client.id}/tasks`, taskId);
        await deleteDoc(taskDocRef);
    };

    useEffect(() => {
        const tasksCollectionPath = `users/${userId}/clients/${client.id}/tasks`;
        const q = query(collection(db, tasksCollectionPath), orderBy("createdAt", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return unsubscribe;
    }, [client.id, db, userId]);

    const completedTasks = tasks.filter(t => t.status === 'Completed').length;
    const totalTasks = tasks.length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    return (
        <div className="animate-fade-in-up">
            <div className="mb-8 flex justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold text-white">{client.name}</h2>
                    <p className="text-slate-400">Onboarding Progress</p>
                </div>
                <button onClick={() => onDeleteClient(client.id)} className="p-2 rounded-lg text-slate-400 bg-slate-800/50 hover:bg-red-500/20 hover:text-red-400 transition-colors">
                    <Trash2 size={20} />
                </button>
            </div>

            <div className="mb-8 p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 shadow-2xl shadow-slate-900/50">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-slate-300">Overall Progress</span>
                    <span className="text-lg font-bold bg-gradient-to-r from-fuchsia-500 to-cyan-500 bg-clip-text text-transparent">{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2.5">
                    <div className="bg-gradient-to-r from-fuchsia-500 to-cyan-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 shadow-2xl shadow-slate-900/50">
                <div className="p-4">
                    <div className="flex gap-2">
                        <input type="text" value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addTask()} placeholder="Add a custom task..." className="flex-grow p-2 text-sm bg-slate-700 border border-slate-600 rounded-md focus:ring-1 focus:ring-indigo-500" />
                        <button onClick={addTask} disabled={!newTaskName.trim()} className="flex items-center justify-center gap-1 bg-indigo-600 text-white font-semibold py-2 px-3 text-sm rounded-md hover:bg-indigo-700 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                            <Plus size={16} /> Add
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <tbody className="divide-y divide-slate-700/50">
                            {tasks.map(task => (
                                <TaskItem key={task.id} task={task} onUpdateStatus={updateTaskStatus} onDelete={deleteTask} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- Task Item Component ---
const TaskItem = ({ task, onUpdateStatus, onDelete }) => {
    const statusConfig = {
        'Pending': { color: 'amber', label: 'Pending' },
        'In Progress': { color: 'sky', label: 'In Progress' },
        'Completed': { color: 'emerald', label: 'Completed' },
    };
    const { color, label } = statusConfig[task.status] || { color: 'slate', label: 'Unknown' };

    return (
        <tr className="group transition-colors hover:bg-slate-800/40">
            <td className="p-4 w-6 text-slate-500 cursor-grab group-hover:text-slate-300"><GripVertical size={16} /></td>
            <td className="p-4 w-full text-sm font-medium text-slate-200">
                <span className={`${task.status === 'Completed' ? 'line-through text-slate-500' : ''}`}>{task.name}</span>
            </td>
            <td className="p-4 whitespace-nowrap">
                <div className="relative group/status">
                    <button className={`flex items-center gap-2 text-xs font-semibold rounded-full py-1 px-3 bg-${color}-500/10 text-${color}-400`}>
                        <span className={`w-2 h-2 rounded-full bg-current`}></span>
                        {label}
                        <ChevronDown size={14} />
                    </button>
                    {/* UPDATED: Dropdown now opens upwards to prevent being clipped by the table body */}
                    <div className="absolute bottom-full mb-2 right-0 w-36 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-1 z-50 opacity-0 pointer-events-none group-hover/status:opacity-100 group-hover/status:pointer-events-auto transition-opacity">
                        {Object.keys(statusConfig).map(status => (
                            <a href="#" key={status} onClick={(e) => { e.preventDefault(); onUpdateStatus(task.id, status); }} className="block w-full text-left px-3 py-1.5 text-xs rounded-md text-slate-300 hover:bg-indigo-500">
                                {statusConfig[status].label}
                            </a>
                        ))}
                    </div>
                </div>
            </td>
            <td className="p-4 text-right">
                <button onClick={() => onDelete(task.id)} className="text-slate-500 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity">
                    <Trash2 size={16} />
                </button>
            </td>
        </tr>
    );
};

// --- UI State Components ---
const LoadingState = () => <div className="flex items-center justify-center h-screen bg-slate-900"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500"></div></div>;
const ErrorState = ({ message }) => <div className="flex items-center justify-center h-screen bg-slate-900"><div className="text-center p-8 bg-slate-800 rounded-lg shadow-xl"><ServerCrash size={48} className="text-red-500 mx-auto mb-4" /><h3 className="text-xl font-bold text-red-500">An Error Occurred</h3><p className="text-slate-400 mt-2">{message}</p></div></div>;
const EmptyState = () => <div className="flex items-center justify-center h-full"><div className="text-center p-10 border-2 border-dashed border-slate-700 rounded-2xl"><FolderKanban size={56} className="text-slate-600 mx-auto mb-4" /><h3 className="text-xl font-semibold text-slate-300">No Client Selected</h3><p className="text-slate-500 mt-2">Select a client from the sidebar or add a new one to begin.</p></div></div>;

