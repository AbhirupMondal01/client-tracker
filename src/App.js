// Final Vercel version with Board View, Priorities, and Due Dates
import React, { useState, useEffect, useRef } from 'react';
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
import { Plus, Trash2, ChevronDown, FolderKanban, ServerCrash, GripVertical, Search, Bell, ChevronsLeft, ChevronsRight, LayoutGrid, List, Flag } from 'lucide-react';

// --- Firebase Configuration for Vercel ---
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
    const [searchTerm, setSearchTerm] = useState('');

    // --- Firebase Initialization and Authentication ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestoreDb);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) setUserId(user.uid);
                else await signInAnonymously(firebaseAuth);
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
            STANDARD_ONBOARDING_TASKS.forEach((taskName, index) => {
                const newTaskRef = doc(collection(db, tasksCollectionPath));
                batch.set(newTaskRef, {
                    name: taskName,
                    status: 'Pending',
                    createdAt: new Date(),
                    order: index,
                    priority: 'Normal',
                    dueDate: null
                });
            });
            await batch.commit();
            const newClientData = { id: newClientRef.id, name: clientName.trim(), createdAt: new Date() };
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
    
    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} />;
    
    return (
        <div className="flex h-screen bg-slate-900 text-white font-sans overflow-hidden">
            <Sidebar
                clients={filteredClients}
                selectedClient={selectedClient}
                setSelectedClient={setSelectedClient}
                onAddClient={addClient}
                isCollapsed={isSidebarCollapsed}
                setIsCollapsed={setIsSidebarCollapsed}
            />
            <main className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'md:ml-72'}`}>
                <Header
                    client={selectedClient}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                />
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

// --- Sidebar, Header, and State Components (mostly unchanged) ---
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

const Header = ({ client, searchTerm, setSearchTerm }) => {
    return (
        <header className="flex-shrink-0 bg-slate-900/50 backdrop-blur-lg border-b border-slate-800/50 p-4 flex items-center justify-between z-20">
            <div>
                <h2 className="text-xl font-bold text-white">{client ? client.name : 'Dashboard'}</h2>
                <p className="text-sm text-slate-400">{client ? 'Onboarding Details' : 'Please select a client'}</p>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative hidden md:block">
                    <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search clients..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full max-w-xs bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                    />
                </div>
                <button className="p-2 rounded-full text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
                    <Bell size={20} />
                </button>
            </div>
        </header>
    );
};

// --- ClientDetail Component (Now with View Switcher) ---
const ClientDetail = ({ client, db, userId, onDeleteClient }) => {
    const [tasks, setTasks] = useState([]);
    const [newTaskName, setNewTaskName] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'board'

    const addTask = async () => {
        if (newTaskName.trim() === '') return;
        const tasksCollectionPath = `users/${userId}/clients/${client.id}/tasks`;
        await addDoc(collection(db, tasksCollectionPath), {
            name: newTaskName.trim(),
            status: 'Pending',
            createdAt: new Date(),
            order: tasks.length,
            priority: 'Normal',
            dueDate: null
        });
        setNewTaskName('');
    };

    const updateTask = async (taskId, data) => {
        const taskDocRef = doc(db, `users/${userId}/clients/${client.id}/tasks`, taskId);
        await updateDoc(taskDocRef, data);
    };

    const deleteTask = async (taskId) => {
        const taskDocRef = doc(db, `users/${userId}/clients/${client.id}/tasks`, taskId);
        await deleteDoc(taskDocRef);
    };
    
    useEffect(() => {
        const tasksCollectionPath = `users/${userId}/clients/${client.id}/tasks`;
        const q = query(collection(db, tasksCollectionPath), orderBy("order", "asc"));
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
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-800/50 rounded-lg p-1">
                        <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}><List size={20}/></button>
                        <button onClick={() => setViewMode('board')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'board' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}><LayoutGrid size={20}/></button>
                    </div>
                    <button onClick={() => onDeleteClient(client.id)} className="p-2 rounded-lg text-slate-400 bg-slate-800/50 hover:bg-red-500/20 hover:text-red-400 transition-colors">
                        <Trash2 size={20} />
                    </button>
                </div>
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

            {viewMode === 'list' ? (
                <ListView tasks={tasks} onUpdateTask={updateTask} onDeleteTask={deleteTask} onAddTask={addTask} newTaskName={newTaskName} setNewTaskName={setNewTaskName} db={db} userId={userId} clientId={client.id} />
            ) : (
                <BoardView tasks={tasks} onUpdateTask={updateTask} />
            )}
        </div>
    );
};

// --- List View Component ---
const ListView = ({ tasks, onUpdateTask, onDeleteTask, onAddTask, newTaskName, setNewTaskName, db, userId, clientId }) => {
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    const handleSort = async () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        let _tasks = [...tasks];
        const draggedItemContent = _tasks.splice(dragItem.current, 1)[0];
        _tasks.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        
        const batch = writeBatch(db);
        _tasks.forEach((task, index) => {
            const taskRef = doc(db, `users/${userId}/clients/${clientId}/tasks`, task.id);
            batch.update(taskRef, { order: index });
        });
        await batch.commit();
    };

    return (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 shadow-2xl shadow-slate-900/50">
            <div className="p-4">
                <div className="flex gap-2">
                    <input type="text" value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && onAddTask()} placeholder="Add a custom task..." className="flex-grow p-2 text-sm bg-slate-700 border border-slate-600 rounded-md focus:ring-1 focus:ring-indigo-500" />
                    <button onClick={onAddTask} disabled={!newTaskName.trim()} className="flex items-center justify-center gap-1 bg-indigo-600 text-white font-semibold py-2 px-3 text-sm rounded-md hover:bg-indigo-700 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                        <Plus size={16} /> Add
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <tbody className="divide-y divide-slate-700/50">
                        {tasks.map((task, index) => (
                            <TaskItem
                                key={task.id}
                                task={task}
                                index={index}
                                onUpdateTask={onUpdateTask}
                                onDeleteTask={onDeleteTask}
                                dragItem={dragItem}
                                dragOverItem={dragOverItem}
                                handleSort={handleSort}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Board View Component ---
const BoardView = ({ tasks, onUpdateTask }) => {
    const statuses = ['Pending', 'In Progress', 'Completed'];
    
    const handleDrop = (e, newStatus) => {
        const taskId = e.dataTransfer.getData("taskId");
        onUpdateTask(taskId, { status: newStatus });
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {statuses.map(status => (
                <div
                    key={status}
                    onDrop={(e) => handleDrop(e, status)}
                    onDragOver={(e) => e.preventDefault()}
                    className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50"
                >
                    <h3 className="font-bold text-lg mb-4 text-white">{status}</h3>
                    <div className="space-y-4">
                        {tasks.filter(task => task.status === status).map(task => (
                            <TaskCard key={task.id} task={task} onUpdateTask={onUpdateTask} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- Task Card Component (for Board View) ---
const TaskCard = ({ task, onUpdateTask }) => {
    return (
        <div
            draggable
            onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)}
            className="bg-slate-800 p-4 rounded-lg shadow-lg cursor-grab active:cursor-grabbing"
        >
            <p className="font-semibold text-white mb-2">{task.name}</p>
            <div className="flex items-center justify-between text-sm text-slate-400">
                <PriorityPicker task={task} onUpdateTask={onUpdateTask} />
                <DatePicker task={task} onUpdateTask={onUpdateTask} />
            </div>
        </div>
    );
};

// --- Task Item Component (for List View) ---
const TaskItem = ({ task, index, onUpdateTask, onDeleteTask, dragItem, dragOverItem, handleSort }) => {
    return (
        <tr
            className="group transition-colors hover:bg-slate-800/40"
            draggable
            onDragStart={() => (dragItem.current = index)}
            onDragEnter={() => (dragOverItem.current = index)}
            onDragEnd={handleSort}
            onDragOver={(e) => e.preventDefault()}
        >
            <td className="p-4 w-6 text-slate-500 cursor-grab group-hover:text-slate-300"><GripVertical size={16} /></td>
            <td className="p-4 w-full text-sm font-medium text-slate-200">
                <span className={`${task.status === 'Completed' ? 'line-through text-slate-500' : ''}`}>{task.name}</span>
            </td>
            <td className="p-4 whitespace-nowrap"><PriorityPicker task={task} onUpdateTask={onUpdateTask} /></td>
            <td className="p-4 whitespace-nowrap"><DatePicker task={task} onUpdateTask={onUpdateTask} /></td>
            <td className="p-4 whitespace-nowrap"><StatusPicker task={task} onUpdateTask={onUpdateTask} /></td>
            <td className="p-4 text-right">
                <button onClick={() => onDeleteTask(task.id)} className="text-slate-500 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity">
                    <Trash2 size={16} />
                </button>
            </td>
        </tr>
    );
};

// --- Reusable Picker Components ---
const StatusPicker = ({ task, onUpdateTask }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);
    const statusConfig = {
        'Pending': { color: 'amber', label: 'Pending' },
        'In Progress': { color: 'sky', label: 'In Progress' },
        'Completed': { color: 'emerald', label: 'Completed' },
    };
    const { color, label } = statusConfig[task.status] || { color: 'slate', label: 'Unknown' };

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [ref]);

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setIsOpen(!isOpen)} className={`flex items-center gap-2 text-xs font-semibold rounded-full py-1 px-3 bg-${color}-500/10 text-${color}-400`}>
                <span className={`w-2 h-2 rounded-full bg-current`}></span>{label}<ChevronDown size={14} />
            </button>
            {isOpen && (
                <div className="absolute top-full mt-2 right-0 w-36 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-1 z-50">
                    {Object.keys(statusConfig).map(status => (
                        <a href="#" key={status} onClick={(e) => { e.preventDefault(); onUpdateTask(task.id, { status }); setIsOpen(false); }} className="block w-full text-left px-3 py-1.5 text-xs rounded-md text-slate-300 hover:bg-indigo-500">{statusConfig[status].label}</a>
                    ))}
                </div>
            )}
        </div>
    );
};

const PriorityPicker = ({ task, onUpdateTask }) => {
    const priorityConfig = {
        'Urgent': { color: 'red', icon: <Flag size={14} className="text-red-500" /> },
        'High': { color: 'orange', icon: <Flag size={14} className="text-orange-500" /> },
        'Normal': { color: 'sky', icon: <Flag size={14} className="text-sky-500" /> },
        'Low': { color: 'slate', icon: <Flag size={14} className="text-slate-500" /> },
    };
    return (
        <div className="flex items-center gap-1">
            {priorityConfig[task.priority]?.icon || <Flag size={14} className="text-slate-500" />}
            <select
                value={task.priority}
                onChange={(e) => onUpdateTask(task.id, { priority: e.target.value })}
                className="bg-transparent text-slate-300 text-sm border-none focus:ring-0"
            >
                {Object.keys(priorityConfig).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
        </div>
    );
};

const DatePicker = ({ task, onUpdateTask }) => {
    const handleDateChange = (e) => {
        onUpdateTask(task.id, { dueDate: e.target.value || null });
    };
    return (
        <input
            type="date"
            value={task.dueDate || ''}
            onChange={handleDateChange}
            className="bg-transparent text-slate-300 text-sm border-none focus:ring-0 p-0"
        />
    );
};

// --- UI State Components ---
const LoadingState = () => <div className="flex items-center justify-center h-screen bg-slate-900"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500"></div></div>;
const ErrorState = ({ message }) => <div className="flex items-center justify-center h-screen bg-slate-900"><div className="text-center p-8 bg-slate-800 rounded-lg shadow-xl"><ServerCrash size={48} className="text-red-500 mx-auto mb-4" /><h3 className="text-xl font-bold text-red-500">An Error Occurred</h3><p className="text-slate-400 mt-2">{message}</p></div></div>;
const EmptyState = () => <div className="flex items-center justify-center h-full"><div className="text-center p-10 border-2 border-dashed border-slate-700 rounded-2xl"><FolderKanban size={56} className="text-slate-600 mx-auto mb-4" /><h3 className="text-xl font-semibold text-slate-300">No Client Selected</h3><p className="text-slate-500 mt-2">Select a client from the sidebar or add a new one to begin.</p></div></div>;

