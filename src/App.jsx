
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, ClipboardCheck, GraduationCap, Bell,
  CalendarDays, PackageSearch, Wrench, Menu, X, LogOut,
  Search, Plus, MapPin, Clock, CheckCircle, BookOpen,
  ArrowUpRight, Megaphone, RefreshCw, Trash2
} from "lucide-react";
import "./App.css";
import api from "./api";

const menu = [
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
  { id: "attendance", name: "Attendance", icon: ClipboardCheck },
  { id: "results", name: "Results", icon: GraduationCap },
  { id: "announcements", name: "Announcements", icon: Bell },
  { id: "events", name: "Campus Events", icon: CalendarDays },
  { id: "lost", name: "Lost & Found", icon: PackageSearch },
  { id: "services", name: "Service Requests", icon: Wrench }
];

const errorText = (error) =>
  error.response?.data?.message || error.message || "Something went wrong.";

const dateText = (value) => {
  if (!value) return "Date not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric"
      });
};

const statusText = (value = "") =>
  String(value).replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

function Badge({ children }) {
  return <span className="badge">{children}</span>;
}

function StatCard({ icon: Icon, title, value, subtitle }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><Icon size={22} /></div>
      <p>{title}</p>
      <h2>{value}</h2>
      <small>{subtitle}</small>
    </div>
  );
}

function PageTitle({ title, description, action }) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">SMART CAMPUS CONNECT</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("CSE");
  const [isRegistering, setIsRegistering] = useState(false);

  const [page, setPage] = useState("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [itemFilter, setItemFilter] = useState("All");
  const [requestFilter, setRequestFilter] = useState("All");

  const [subjects, setSubjects] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [results, setResults] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);

  const [modal, setModal] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  const role = user?.role || "student";
  const isStaff = ["admin", "faculty"].includes(role);
  const isAdmin = role === "admin";
  const isServiceStaff = role === "service_staff";

  const showMessage = (text) => setMessage(text);

  async function loadData() {
    setPageLoading(true);
    try {
      const requestsToLoad = [
        api.get("/subjects"),
        api.get("/attendance"),
        api.get("/results"),
        api.get("/announcements"),
        api.get("/events"),
        api.get("/event-registrations"),
        api.get("/lost-found"),
        api.get("/service-requests")
      ];

      const responses = await Promise.allSettled(requestsToLoad);
      const read = (index) => {
        const result = responses[index];
        if (result.status === "fulfilled") return result.value.data;
        console.error("Could not load section:", index, result.reason);
        return [];
      };

      setSubjects(Array.isArray(read(0)) ? read(0) : []);
      setAttendance(Array.isArray(read(1)) ? read(1) : []);
      setResults(Array.isArray(read(2)) ? read(2) : []);
      setAnnouncements(Array.isArray(read(3)) ? read(3) : []);
      setEvents(Array.isArray(read(4)) ? read(4) : []);
      setRegistrations(Array.isArray(read(5)) ? read(5) : []);
      setItems(Array.isArray(read(6)) ? read(6) : []);
      setRequests(Array.isArray(read(7)) ? read(7) : []);

      if (responses.some(r => r.status === "rejected")) {
        showMessage("Some sections could not load. Check your backend and database.");
      }
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    api.get("/auth/me")
      .then(response => {
        setUser(response.data);
        setName(response.data.full_name);
        setEmail(response.data.email);
      })
      .catch(() => {
        localStorage.removeItem("token");
      });
  }, []);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  async function login(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", response.data.token);
      setUser(response.data.user);
      setName(response.data.user.full_name);
      setEmail(response.data.user.email);
      setPassword("");
      setPage("dashboard");
      showMessage("Login successful!");
    } catch (error) {
      showMessage(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  async function register(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await api.post("/auth/register", {
        full_name: fullName,
        email,
        password,
        department
      });
      showMessage(response.data.message || "Account created. Please sign in.");
      setIsRegistering(false);
      setPassword("");
      setFullName("");
    } catch (error) {
      showMessage(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    setName("");
    setEmail("");
    setPassword("");
    setPage("dashboard");
    setModal("");
    setMessage("");
  }

  async function submitForm(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = key => String(form.get(key) || "").trim();

    setLoading(true);
    try {
      if (modal === "item") {
        await api.post("/lost-found", {
          item_name: value("name"),
          item_type: value("type").toLowerCase(),
          location: value("location"),
          description: value("description"),
          item_date: value("item_date") || null
        });
        showMessage("Lost-and-found report submitted.");
        await loadData();
      }

      if (modal === "service") {
        await api.post("/service-requests", {
          title: value("title"),
          description: value("description"),
          category: value("category"),
          location: value("location")
        });
        showMessage("Service request submitted successfully.");
        await loadData();
      }

      if (modal === "announcement") {
        await api.post("/announcements", {
          title: value("title"),
          message: value("message"),
          target_audience: value("audience")
        });
        showMessage("Announcement published.");
        await loadData();
      }

      if (modal === "event") {
        await api.post("/events", {
          event_name: value("event_name"),
          description: value("description"),
          event_date: value("event_date"),
          registration_deadline: value("registration_deadline") || null,
          location: value("location"),
          capacity: value("capacity") ? Number(value("capacity")) : null
        });
        showMessage("Campus event created.");
        await loadData();
      }

      if (modal === "attendance") {
        await api.post("/attendance", {
          student_id: Number(value("student_id")),
          subject_id: Number(value("subject_id")),
          attendance_date: value("attendance_date"),
          status: value("status")
        });
        showMessage("Attendance marked successfully.");
        await loadData();
      }

      if (modal === "result") {
        const marks = Number(value("marks"));
        const maxMarks = Number(value("max_marks") || 100);
        await api.post("/results", {
          student_id: Number(value("student_id")),
          subject_id: Number(value("subject_id")),
          marks,
          max_marks: maxMarks,
          grade: value("grade"),
          semester: value("semester"),
          published: form.get("published") === "on"
        });
        showMessage("Student result saved.");
        await loadData();
      }

      setModal("");
    } catch (error) {
      showMessage(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  async function registerForEvent(eventId) {
    setLoading(true);
    try {
      await api.post(`/events/${eventId}/register`);
      showMessage("You are registered for this event.");
      await loadData();
    } catch (error) {
      showMessage(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  async function updateItemStatus(itemId, status) {
    try {
      await api.patch(`/lost-found/${itemId}/status`, { status });
      showMessage("Lost-and-found status updated.");
      await loadData();
    } catch (error) {
      showMessage(errorText(error));
    }
  }

  async function updateRequest(requestId, status) {
    try {
      await api.patch(`/service-requests/${requestId}`, { status });
      showMessage("Service request status updated.");
      await loadData();
    } catch (error) {
      showMessage(errorText(error));
    }
  }

  async function deleteEvent(eventId) {
    if (!window.confirm("Delete this campus event?")) return;
    try {
      await api.delete(`/events/${eventId}`);
      showMessage("Event deleted.");
      await loadData();
    } catch (error) {
      showMessage(errorText(error));
    }
  }

  async function deleteAnnouncement(announcementId) {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await api.delete(`/announcements/${announcementId}`);
      showMessage("Announcement deleted.");
      await loadData();
    } catch (error) {
      showMessage(errorText(error));
    }
  }

  const attendanceSummary = useMemo(() => {
    const summary = new Map();
    attendance.forEach(record => {
      const id = record.subject_id;
      if (!summary.has(id)) {
        summary.set(id, {
          id,
          name: record.subject_name || "Subject",
          code: record.subject_code || "",
          attended: 0,
          total: 0
        });
      }
      const row = summary.get(id);
      row.total += 1;
      if (record.status === "present" || record.status === "late") row.attended += 1;
    });
    return Array.from(summary.values());
  }, [attendance]);

  const attendanceAverage = attendanceSummary.length
    ? Math.round(attendanceSummary.reduce(
        (sum, s) => sum + (s.total ? s.attended / s.total * 100 : 0), 0
      ) / attendanceSummary.length)
    : 0;

  const openRequests = requests.filter(r =>
    !["resolved", "closed"].includes(String(r.status).toLowerCase())
  ).length;

  const activePage = menu.find(item => item.id === page);
  const pageName = activePage?.name || "Dashboard";

  const visibleMenu = role === "faculty"
    ? menu.filter(item => item.id !== "services")
    : menu;

  const registeredEventIds = new Set(
    registrations
      .filter(r => String(r.status).toLowerCase() === "registered")
      .map(r => Number(r.event_id))
  );

  const filteredItems = items.filter(item =>
    (itemFilter === "All" ||
      String(item.item_type).toLowerCase() === itemFilter.toLowerCase()) &&
    `${item.item_name} ${item.location || ""} ${item.description || ""}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const filteredRequests = requests.filter(r =>
    (requestFilter === "All" ||
      statusText(r.status) === requestFilter) &&
    `${r.request_id} ${r.title} ${r.location || ""} ${r.category || ""}`
      .toLowerCase().includes(search.toLowerCase())
  );

  if (!user) {
    return (
      <div className="login-layout">
        <div className="login-banner">
          <div className="brand">
            <GraduationCap size={30} /> Smart Campus<span>.</span>
          </div>
          <div className="login-message">
            <span className="eyebrow">YOUR CAMPUS, CONNECTED</span>
            <h1>A smarter way to experience campus life.</h1>
            <p>One place for academics, campus events, announcements and everyday student needs.</p>
            <div className="login-feature">
              <span><ClipboardCheck /> Attendance tracking</span>
              <span><CalendarDays /> Campus events</span>
              <span><Wrench /> Campus support</span>
            </div>
          </div>
          <small>Smart Campus Connect · Student Project</small>
        </div>

        <div className="login-area">
          <form className="login-form" onSubmit={isRegistering ? register : login}>
            <span className="eyebrow">{isRegistering ? "JOIN YOUR CAMPUS" : "WELCOME BACK"}</span>
            <h2>{isRegistering ? "Create your account" : "Sign in to continue"}</h2>
            <p>{isRegistering
              ? "Register to access the Smart Campus Connect portal."
              : "Enter your details to explore the campus portal."}</p>

            {isRegistering && <>
              <label>Full name
                <input value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="Enter your full name" autoComplete="name" required />
              </label>
              <label>Department
                <select value={department} onChange={e => setDepartment(e.target.value)} required>
                  <option value="CSE">CSE</option>
                  <option value="ECE">ECE</option>
                  <option value="EEE">EEE</option>
                  <option value="Mechanical">Mechanical</option>
                  <option value="Civil">Civil</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </>}

            <label>Email address
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@college.edu" autoComplete="email" required />
            </label>
            <label>Password
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isRegistering ? "At least 8 characters" : "Enter password"}
                autoComplete={isRegistering ? "new-password" : "current-password"}
                minLength={isRegistering ? 8 : undefined} required />
            </label>

            {message && <p role="status" style={{ color: "#b42318" }}>{message}</p>}

            <button className="primary-btn full-btn" type="submit" disabled={loading}>
              {loading
                ? (isRegistering ? "Creating account..." : "Signing in...")
                : (isRegistering ? "Create account" : "Sign in")}
              <ArrowUpRight size={17} />
            </button>

            <div className="demo-notice">
              {isRegistering ? "Already have an account? " : "New to Smart Campus Connect? "}
              <button type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setMessage("");
                  setPassword("");
                }}
                style={{
                  border: "none", background: "none", color: "#d4af37",
                  fontWeight: 700, cursor: "pointer", padding: 0
                }}>
                {isRegistering ? "Sign in" : "Register"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {mobileMenu && <div className="mobile-overlay" onClick={() => setMobileMenu(false)} />}

      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <GraduationCap size={28} />
          <span>Smart Campus<span>.</span></span>
          <button className="mobile-close" onClick={() => setMobileMenu(false)}>
            <X />
          </button>
        </div>

        <p className="side-label">MAIN MENU</p>
        <nav>
          {visibleMenu.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => {
                  setPage(item.id);
                  setMobileMenu(false);
                  setSearch("");
                }}>
                <Icon size={19} /> {item.name}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="support-card">
            <Wrench size={22} />
            <strong>Need campus support?</strong>
            <p>Report an issue and track its progress.</p>
            <button onClick={() => setPage("services")}>Get support →</button>
          </div>
          <div className="profile">
            <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>
            <div className="profile-info">
              <strong>{name}</strong>
              <small>{statusText(role)}</small>
            </div>
            <button className="logout-btn" title="Sign out" onClick={logout}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="menu-toggle" onClick={() => setMobileMenu(true)}>
              <Menu />
            </button>
            <span>Workspace</span> / <strong>{pageName}</strong>
          </div>
          <div className="topbar-user">
            <button className="icon-btn" onClick={() => setPage("announcements")} title="Announcements">
              <Bell size={20} />
            </button>
            <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>

        <div className="content">
          {message && (
            <div className="toast" role="status">
              <CheckCircle size={18} /> {message}
              <button className="close-btn" onClick={() => setMessage("")}><X size={16} /></button>
            </div>
          )}

          {pageLoading && (
            <p className="loading-line"><RefreshCw size={16} /> Loading campus data...</p>
          )}

          {page === "dashboard" && <>
            <section className="hero">
              <div>
                <span className="hero-label">YOUR CAMPUS AT A GLANCE</span>
                <h1>Hello, {name.split(" ")[0]}! ✨</h1>
                <p>Welcome to your campus space. Here's what's happening today.</p>
                <button className="white-btn" onClick={() => setPage("events")}>
                  Explore events <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="hero-decoration"><GraduationCap size={100} /></div>
            </section>

            <div className="section-heading">
              <div><h2>Your Overview</h2><p>Live information from your campus database.</p></div>
              <button className="secondary-btn" onClick={loadData}><RefreshCw size={16} /> Refresh</button>
            </div>

            <div className="stats-grid">
              <StatCard icon={ClipboardCheck} title="Attendance Average"
                value={`${attendanceAverage}%`} subtitle="Based on recorded classes" />
              <StatCard icon={BookOpen} title="Subjects"
                value={subjects.length} subtitle="Subjects in the database" />
              <StatCard icon={CalendarDays} title="Campus Events"
                value={events.length} subtitle="Events available" />
              <StatCard icon={Wrench} title="Open Requests"
                value={openRequests} subtitle="Requests awaiting action" />
            </div>

            <div className="dashboard-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div><h3>Latest Announcements</h3><p>Updates from your campus</p></div>
                  <button className="link-btn" onClick={() => setPage("announcements")}>View all →</button>
                </div>
                {announcements.slice(0, 3).map(a => (
                  <div className="announcement-row" key={a.announcement_id}>
                    <div className="row-icon"><Megaphone size={19} /></div>
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.message}</p>
                      <small>{dateText(a.created_at)} · {statusText(a.target_audience || "all")}</small>
                    </div>
                  </div>
                ))}
                {!announcements.length && <p>No announcements available.</p>}
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div><h3>Upcoming Events</h3><p>Join campus activities</p></div>
                  <button className="link-btn" onClick={() => setPage("events")}>View all →</button>
                </div>
                {events.slice(0, 3).map(event => (
                  <div className="mini-event" key={event.event_id}>
                    <div className="event-icon"><CalendarDays /></div>
                    <div><strong>{event.event_name}</strong><p>{dateText(event.event_date)}</p></div>
                  </div>
                ))}
                {!events.length && <p>No events have been created yet.</p>}
              </section>
            </div>
          </>}

          {page === "attendance" && <>
            <PageTitle title="Attendance" description="Track attendance recorded for your subjects."
              action={isStaff && <button className="primary-btn" onClick={() => setModal("attendance")}><Plus size={16} /> Mark Attendance</button>} />
            <div className="stats-grid three">
              <StatCard icon={ClipboardCheck} title="Overall Attendance"
                value={`${attendanceAverage}%`} subtitle="Based on attendance records" />
              <StatCard icon={CheckCircle} title="Classes Attended"
                value={attendance.filter(a => ["present", "late"].includes(a.status)).length}
                subtitle="Present or late" />
              <StatCard icon={Clock} title="Classes Missed"
                value={attendance.filter(a => a.status === "absent").length}
                subtitle="Recorded absences" />
            </div>
            <section className="panel table-panel">
              <div className="panel-heading">
                <div><h3>Attendance Records</h3><p>Attendance stored in the database</p></div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>DATE</th>{isStaff && <th>STUDENT</th>}<th>SUBJECT</th><th>STATUS</th></tr></thead>
                  <tbody>
                    {attendance.map(a => (
                      <tr key={a.attendance_id}>
                        <td>{dateText(a.attendance_date)}</td>
                        {isStaff && <td>{a.student_name || a.student_id}</td>}
                        <td><strong>{a.subject_name}</strong><small>{a.subject_code}</small></td>
                        <td><Badge>{statusText(a.status)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!attendance.length && <p className="empty-state">No attendance records yet.</p>}
            </section>
          </>}

          {page === "results" && <>
            <PageTitle title="Academic Results" description="Review marks and grades recorded for your subjects."
              action={isStaff && <button className="primary-btn" onClick={() => setModal("result")}><Plus size={16} /> Add Result</button>} />
            <section className="panel table-panel">
              <div className="panel-heading"><h3>Subject Results</h3></div>
              <div className="table-scroll">
                <table>
                  <thead><tr>{isStaff && <th>STUDENT ID</th>}<th>SUBJECT</th><th>SEMESTER</th><th>MARKS</th><th>GRADE</th><th>STATUS</th></tr></thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.result_id}>
                        {isStaff && <td>{r.student_id}</td>}
                        <td><strong>{r.subject_name}</strong><small>{r.subject_code}</small></td>
                        <td>{r.semester}</td>
                        <td>{r.marks}/{r.max_marks}</td>
                        <td><Badge>{r.grade || "Not assigned"}</Badge></td>
                        <td>{r.published ? "Published" : "Not published"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!results.length && <p className="empty-state">No results are available yet.</p>}
            </section>
          </>}

          {page === "announcements" && <>
            <PageTitle title="Announcements" description="Important news and updates from your campus."
              action={isStaff && <button className="primary-btn" onClick={() => setModal("announcement")}><Plus size={16} /> New Announcement</button>} />
            <div className="card-list">
              {announcements.map(a => (
                <article className="panel announcement-card" key={a.announcement_id}>
                  <div className="row-icon"><Megaphone size={21} /></div>
                  <div>
                    <div className="card-meta">
                      {statusText(a.target_audience || "all")} · {dateText(a.created_at)}
                    </div>
                    <h3>{a.title}</h3>
                    <p>{a.message}</p>
                    {isAdmin && (
                      <button className="secondary-btn" onClick={() => deleteAnnouncement(a.announcement_id)}>
                        <Trash2 size={15} /> Delete
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!announcements.length && <p className="empty-state">No announcements available.</p>}
            </div>
          </>}

          {page === "events" && <>
            <PageTitle title="Campus Events" description="Discover workshops, activities and campus opportunities."
              action={isStaff && <button className="primary-btn" onClick={() => setModal("event")}><Plus size={16} /> Create Event</button>} />
            <div className="event-grid">
              {events.map(event => {
                const registered = registeredEventIds.has(Number(event.event_id));
                return (
                  <article className="panel event-card" key={event.event_id}>
                    <div className="event-cover"><CalendarDays size={34} /></div>
                    <div className="event-body">
                      <Badge>{registered ? "Registered" : "Campus Event"}</Badge>
                      <h3>{event.event_name}</h3>
                      <p>{event.description || "Join this campus activity."}</p>
                      <div className="event-detail"><CalendarDays size={15} />{dateText(event.event_date)}</div>
                      <div className="event-detail"><MapPin size={15} />{event.location || "Location to be announced"}</div>
                      {role === "student" && (
                        <button className="primary-btn full-btn"
                          disabled={loading || registered}
                          onClick={() => registerForEvent(event.event_id)}>
                          {registered ? "Already Registered" : "Register for Event"}
                        </button>
                      )}
                      {isAdmin && (
                        <button className="secondary-btn full-btn" onClick={() => deleteEvent(event.event_id)}>
                          <Trash2 size={15} /> Delete Event
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {!events.length && <p className="empty-state">No events have been created yet.</p>}
          </>}

          {page === "lost" && <>
            <PageTitle title="Lost & Found" description="Help lost belongings find their owners."
              action={<button className="primary-btn" onClick={() => setModal("item")}><Plus size={16} /> Report Item</button>} />
            <div className="toolbar">
              <div className="search-box">
                <Search size={18} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items or locations..." />
              </div>
              <select value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
                <option>All</option><option>Lost</option><option>Found</option>
              </select>
            </div>
            <div className="event-grid">
              {filteredItems.map(item => (
                <article className="panel item-card" key={item.item_id}>
                  <div className="item-cover"><PackageSearch size={40} /><Badge>{statusText(item.item_type)}</Badge></div>
                  <div className="event-body">
                    <h3>{item.item_name}</h3>
                    <p>{item.description || "No description provided."}</p>
                    <div className="event-detail"><MapPin size={15} />{item.location || "Location not provided"}</div>
                    <p>Status: <strong>{statusText(item.status)}</strong></p>
                    <p><small>Reported by: {item.reporter_name || "Campus user"}</small></p>
                    {["open", "claimed"].includes(String(item.status).toLowerCase()) && (
                      <label>Update status
                        <select value={String(item.status).toLowerCase()}
                          onChange={e => updateItemStatus(item.item_id, e.target.value)}>
                          <option value="open">Open</option>
                          <option value="claimed">Claimed</option>
                          <option value="returned">Returned</option>
                          <option value="closed">Closed</option>
                        </select>
                      </label>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {!filteredItems.length && <p className="empty-state">No matching items found.</p>}
          </>}

          {page === "services" && <>
            <PageTitle title="Service Requests" description="Report campus issues and track their progress."
              action={<button className="primary-btn" onClick={() => setModal("service")}><Plus size={16} /> New Request</button>} />
            <div className="toolbar">
              <div className="search-box">
                <Search size={18} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search service requests..." />
              </div>
              <select value={requestFilter} onChange={e => setRequestFilter(e.target.value)}>
                <option>All</option><option>Submitted</option><option>Assigned</option>
                <option>In Progress</option><option>Resolved</option><option>Closed</option>
              </select>
            </div>
            <section className="panel table-panel">
              <div className="table-scroll">
                <table>
                  <thead><tr><th>REQUEST ID</th><th>REQUEST</th><th>CATEGORY</th><th>LOCATION</th><th>STATUS</th></tr></thead>
                  <tbody>
                    {filteredRequests.map(r => (
                      <tr key={r.request_id}>
                        <td>SC-{r.request_id}</td>
                        <td><strong>{r.title}</strong><small>{r.description}</small></td>
                        <td>{statusText(r.category)}</td>
                        <td>{r.location}</td>
                        <td>
                          {(isAdmin || isServiceStaff) ? (
                            <select value={String(r.status).toLowerCase()}
                              onChange={e => updateRequest(r.request_id, e.target.value)}>
                              <option value="submitted">Submitted</option>
                              <option value="assigned">Assigned</option>
                              <option value="in_progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                              <option value="closed">Closed</option>
                            </select>
                          ) : <Badge>{statusText(r.status)}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredRequests.length && <p className="empty-state">No matching service requests.</p>}
            </section>
          </>}
        </div>

        <footer className="footer">
          <span>© 2026 Smart Campus Connect</span>
          <span><span className="online-dot" /> Connected to campus portal</span>
        </footer>
      </main>

      {modal && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setModal("")}>
          <form className="modal" onSubmit={submitForm}>
            <div className="modal-heading">
              <h2>
                {{
                  item: "Report a Lost or Found Item",
                  service: "Create Service Request",
                  announcement: "New Announcement",
                  event: "Create Campus Event",
                  attendance: "Mark Attendance",
                  result: "Add Student Result"
                }[modal]}
              </h2>
              <button type="button" className="close-btn" onClick={() => setModal("")}><X /></button>
            </div>

            {modal === "item" && <>
              <label>Item name<input name="name" required placeholder="e.g. Black notebook" /></label>
              <label>Type<select name="type"><option value="lost">Lost</option><option value="found">Found</option></select></label>
              <label>Location<input name="location" required placeholder="Where was it lost or found?" /></label>
              <label>Date<input name="item_date" type="date" /></label>
              <label>Description<textarea name="description" rows="3" placeholder="Describe the item..." /></label>
            </>}

            {modal === "service" && <>
              <label>Request title<input name="title" required placeholder="Briefly describe the issue" /></label>
              <label>Description<textarea name="description" required rows="3" placeholder="Explain the problem" /></label>
              <label>Category
                <select name="category">
                  <option value="electrical">Electrical</option><option value="water">Water</option>
                  <option value="cleaning">Cleaning</option><option value="classroom">Classroom</option>
                  <option value="laboratory">Laboratory</option><option value="network">Network</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>Location<input name="location" required placeholder="Building, room or area" /></label>
            </>}

            {modal === "announcement" && <>
              <label>Title<input name="title" required placeholder="Announcement title" /></label>
              <label>Message<textarea name="message" required rows="4" placeholder="Write your announcement..." /></label>
              <label>Audience
                <select name="audience">
                  <option value="all">Everyone</option><option value="students">Students</option>
                  <option value="faculty">Faculty</option>
                </select>
              </label>
            </>}

            {modal === "event" && <>
              <label>Event name<input name="event_name" required placeholder="Campus event name" /></label>
              <label>Description<textarea name="description" rows="3" placeholder="Event details" /></label>
              <label>Event date and time<input name="event_date" type="datetime-local" required /></label>
              <label>Registration deadline<input name="registration_deadline" type="datetime-local" /></label>
              <label>Location<input name="location" placeholder="Auditorium, lab, etc." /></label>
              <label>Capacity<input name="capacity" type="number" min="1" placeholder="Optional maximum attendees" /></label>
            </>}

            {modal === "attendance" && <>
              <label>Student user ID<input name="student_id" type="number" min="1" required placeholder="Enter student ID from database" /></label>
              <label>Subject
                <select name="subject_id" required defaultValue="">
                  <option value="" disabled>Select subject</option>
                  {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name} ({s.subject_code})</option>)}
                </select>
              </label>
              <label>Date<input name="attendance_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
              <label>Status
                <select name="status" required>
                  <option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option>
                </select>
              </label>
            </>}

            {modal === "result" && <>
              <label>Student user ID<input name="student_id" type="number" min="1" required placeholder="Enter student ID from database" /></label>
              <label>Subject
                <select name="subject_id" required defaultValue="">
                  <option value="" disabled>Select subject</option>
                  {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name} ({s.subject_code})</option>)}
                </select>
              </label>
              <label>Semester<input name="semester" type="number" min="1" required placeholder="e.g. 3" /></label>
              <label>Marks<input name="marks" type="number" min="0" required /></label>
              <label>Maximum marks<input name="max_marks" type="number" min="1" defaultValue="100" required /></label>
              <label>Grade<input name="grade" placeholder="e.g. A, A+, B" /></label>
              <label className="checkbox-label"><input name="published" type="checkbox" /> Publish result for student</label>
            </>}

            <button className="primary-btn full-btn" type="submit" disabled={loading}>
              {loading ? "Saving..." : "Submit"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
