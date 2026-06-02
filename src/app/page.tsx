"use client";

import { useState, useEffect } from "react";
import styles from "./dashboard.module.css";
import { insforge } from "@/lib/insforge";

export default function Home() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [showNotification, setShowNotification] = useState(true);

  // App metrics & state
  const [streak, setStreak] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [consistency, setConsistency] = useState(0.0);
  const [health, setHealth] = useState(0.0);

  // Stats states
  const [executionsPerHour, setExecutionsPerHour] = useState(0.0);
  const [velocityChange, setVelocityChange] = useState(0.0);
  const [velocityTrend, setVelocityTrend] = useState("steady");
  const [velocityThisWeek, setVelocityThisWeek] = useState(0);
  const [velocityLastWeek, setVelocityLastWeek] = useState(0);

  const [noCodePercentage, setNoCodePercentage] = useState(0);
  const [customCodePercentage, setCustomCodePercentage] = useState(0);
  const [detectedTools, setDetectedTools] = useState<string[]>([]);

  const [challengeTitle, setChallengeTitle] = useState("Build an n8n webhook listener for GitHub issues");
  const [loading, setLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [showModal, setShowModal] = useState(false);

  // Form states for proof upload
  const [progressNote, setProgressNote] = useState("");
  const [githubLink, setGithubLink] = useState("");
  const [loomLink, setLoomLink] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Submissions log
  const [submissions, setSubmissions] = useState<any[]>([]);

  // Auth States
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");

  // Leaderboard data from DB
  const [leaderboardList, setLeaderboardList] = useState<any[]>([]);

  const [isAdmin, setIsAdmin] = useState(false);
  const [modBuilder, setModBuilder] = useState<any>(null);
  const [modStreakInput, setModStreakInput] = useState<string>("");
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);



  useEffect(() => {
    checkSession();
    fetchLeaderboard();
  }, []);

  const checkSession = async () => {
    try {
      const { data, error } = await insforge.auth.getCurrentUser();
      if (data && data.user) {
        setUser(data.user);
        const isUserAdmin = await fetchProfileMetrics(data.user.id);
        await fetchSubmissions(data.user.id, isUserAdmin);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Session check failed:", err);
    }
  };


  const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getYesterdayDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchProfileMetrics = async (userId: string) => {
    try {
      const { data, error } = await insforge.database
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (data) {
        setStreak(data.streak_count || 0);
        setCompleted(data.completed);
        setConsistency(Number(data.consistency) || 0);
        setHealth((Number(data.streak_health) || 0) / 100);
        setExecutionsPerHour(Number(data.executions_per_hour) || 0.0);
        setVelocityChange(Number(data.velocity_change) || 0.0);
        setVelocityTrend(data.velocity_trend || "steady");
        setVelocityThisWeek(Number(data.velocity_this_week) || 0);
        setVelocityLastWeek(Number(data.velocity_last_week) || 0);
        if (data.challenge_title) {
          setChallengeTitle(data.challenge_title);
        }

        // Retrieve the latest submission workflow breakdown
        try {
          const { data: latestSub } = await insforge.database
            .from("submissions")
            .select("workflow_breakdown")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestSub && latestSub.workflow_breakdown) {
            const breakdown = latestSub.workflow_breakdown;
            setNoCodePercentage(Number(breakdown.no_code_percentage) || 0);
            setCustomCodePercentage(Number(breakdown.custom_code_percentage) || 0);
            setDetectedTools(breakdown.detected_tools || []);
          } else {
            setNoCodePercentage(0);
            setCustomCodePercentage(0);
            setDetectedTools([]);
          }
        } catch (subErr) {
          console.error("Error fetching latest submission workflow breakdown:", subErr);
        }

        setIsAdmin(!!data.is_admin);
        
        // Streak broken check
        const today = getLocalDateString();
        const yesterday = getYesterdayDateString();
        const lastCompleted = data.last_completed_date;
        
        if (lastCompleted && lastCompleted !== today && lastCompleted !== yesterday) {
          await insforge.database
            .from("profiles")
            .update({ streak_count: 0, completed: false })
            .eq("id", userId);
          setStreak(0);
          setCompleted(false);
        } else if (lastCompleted && lastCompleted !== today) {
          if (data.completed) {
            await insforge.database
              .from("profiles")
              .update({ completed: false })
              .eq("id", userId);
            setCompleted(false);
          }
        }
        return !!data.is_admin;
      } else {
        // Create profile if missing
        const newProfile = {
          id: userId,
          streak_count: 0,
          consistency: 0.0,
          streak_health: 0.0,
          challenge_title: challengeTitle,
          completed: false,
          last_completed_date: null,
          executions_per_hour: 0.0,
          velocity_change: 0.0,
          velocity_this_week: 0,
          velocity_last_week: 0,
          velocity_trend: "steady",
          is_admin: false
        };
        await insforge.database.from("profiles").insert([newProfile]);
        setStreak(0);
        setCompleted(false);
        setConsistency(0.0);
        setHealth(0.0);
        setExecutionsPerHour(0.0);
        setVelocityChange(0.0);
        setVelocityTrend("steady");
        setVelocityThisWeek(0);
        setVelocityLastWeek(0);
        setNoCodePercentage(0);
        setCustomCodePercentage(0);
        setDetectedTools([]);
        setIsAdmin(false);
        return false;
      }
    } catch (err) {
      console.error("Error fetching profile metrics:", err);
      return false;
    }
  };


  const fetchSubmissions = async (userId: string, forceAdmin = false) => {
    try {
      let query = insforge.database
        .from("submissions")
        .select("*")
        .order("created_at", { ascending: false });

      if (!forceAdmin) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;

      if (data) {
        setSubmissions(
          data.map((sub: any) => ({
            id: sub.id,
            userId: sub.user_id,
            date: sub.date,
            createdAt: sub.created_at,
            note: sub.note,
            githubLink: sub.github_link || undefined,
            loomLink: sub.loom_link || undefined,
            challengeTitle: sub.challenge_title,
            validationStatus: sub.validation_status,
            validationScore: sub.validation_score,
            validationSignals: sub.validation_signals || [],
            validatorFeedback: sub.validator_feedback,
            missingElements: sub.missing_elements || []
          }))
        );
      }
    } catch (err) {
      console.error("Error fetching submissions:", err);
    }
  };



  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await insforge.database
        .from("profiles")
        .select("*")
        .order("streak_count", { ascending: false })
        .limit(20);

      if (data) {
        setLeaderboardList(data);
      }
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);

    try {
      if (authTab === "login") {
        const { data, error } = await insforge.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });

        if (error) throw error;

        if (data && data.user) {
          setUser(data.user);
          const isUserAdmin = await fetchProfileMetrics(data.user.id);
          await fetchSubmissions(data.user.id, isUserAdmin);
          await fetchLeaderboard();
          setShowAuthModal(false);
        }
      } else {
        // Sign Up
        const { data, error } = await insforge.auth.signUp({
          email: authEmail,
          password: authPassword,
          name: authName || undefined,
        });

        if (error) throw error;

        if (data && data.user) {
          setUser(data.user);
          // Manually create profile
          const newProfile = {
            id: data.user.id,
            streak_count: 0,
            consistency: 0.0,
            streak_health: 0.0,
            challenge_title: challengeTitle,
            completed: false,
            last_completed_date: null,
            executions_per_hour: 0.0,
            velocity_change: 0.0,
            velocity_this_week: 0,
            velocity_last_week: 0,
            velocity_trend: "steady",
            is_admin: false
          };
          await insforge.database.from("profiles").insert([newProfile]);

          setStreak(0);
          setCompleted(false);
          setConsistency(0.0);
          setHealth(0.0);
          setExecutionsPerHour(0.0);
          setVelocityChange(0.0);
          setVelocityTrend("steady");
          setVelocityThisWeek(0);
          setVelocityLastWeek(0);
          setNoCodePercentage(0);
          setCustomCodePercentage(0);
          setDetectedTools([]);
          setIsAdmin(false);

          await fetchSubmissions(data.user.id, false);
          await fetchLeaderboard();
          setShowAuthModal(false);
        }
      }
    } catch (err: any) {
      console.error("Auth action failed:", err);
      setAuthError(err.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await insforge.auth.signOut();
      setUser(null);
      setStreak(0);
      setCompleted(false);
      setConsistency(0.0);
      setHealth(0.0);
      setSubmissions([]);
      setExecutionsPerHour(0.0);
      setVelocityChange(0.0);
      setVelocityTrend("steady");
      setVelocityThisWeek(0);
      setVelocityLastWeek(0);
      setNoCodePercentage(0);
      setCustomCodePercentage(0);
      setDetectedTools([]);
      setIsAdmin(false);
      await fetchLeaderboard();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };


  const fetchChallenge = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/challenge");
      const data = await response.json();
      if (data && data.challenge) {
        setChallengeTitle(data.challenge);
        setCompleted(false); // Reset completion state for the new task
        
        // If logged in, update user's current challenge in profiles table
        if (user) {
          await insforge.database
            .from("profiles")
            .update({ challenge_title: data.challenge, completed: false })
            .eq("id", user.id);
        }

        setShowModal(true);
      }
    } catch (err) {
      console.error("Error fetching challenge:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progressNote.trim()) {
      setErrorMessage("Please enter a short progress note.");
      return;
    }

    if (!user) {
      setErrorMessage("You must be logged in to submit proof.");
      setShowAuthModal(true);
      return;
    }

    setLoading(true);
    try {
      // Check if user has already completed today's streak to prevent duplicate completions
      const todayStr = getLocalDateString();
      const { data: profileData } = await insforge.database
        .from("profiles")
        .select("last_completed_date")
        .eq("id", user.id)
        .maybeSingle();

      if (profileData?.last_completed_date === todayStr) {
        alert("You have already submitted a completion for today!");
        setProgressNote("");
        setGithubLink("");
        setLoomLink("");
        setErrorMessage("");
        setActiveTab("Overview");
        setLoading(false);
        return;
      }

      // Call validation API
      const response = await fetch("/api/validate-submission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: user.id,
          challenge_id: challengeTitle,
          github_url: githubLink.trim() || null,
          proof_text: progressNote.trim() || null,
          proof_file_url: loomLink.trim() || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to validate submission.");
      }

      const resData = await response.json();

      if (resData.status === "validating") {
        setIsValidating(true);
        setValidationMessage(resData.message || "Reviewing your submission...");
        
        const submissionId = resData.submission_id;
        const currentGithubLink = githubLink.trim();
        
        // Start polling every 2 seconds
        const pollInterval = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/submission/${submissionId}/status`);
            if (!pollRes.ok) {
              console.error("Failed to poll submission status.");
              return;
            }
            
            const pollData = await pollRes.json();
            
            if (pollData.status !== "pending") {
              clearInterval(pollInterval);
              setIsValidating(false);
              setValidationMessage("");
              
              // Show validator feedback
              alert(pollData.feedback);
              
              if (pollData.status === "complete") {
                setCompleted(true);
              }
              
              // Sync metrics, submissions and leaderboard
              await fetchProfileMetrics(user.id);
              await fetchSubmissions(user.id, isAdmin);
              await fetchLeaderboard();
              
              // Trigger tools usage breakdown analysis if validated complete and github url exists
              if (pollData.status === "complete" && currentGithubLink) {
                try {
                  const analyzeRes = await fetch("/api/analyze-repo", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      github_url: currentGithubLink,
                      user_id: user.id,
                      challenge_id: challengeTitle
                    })
                  });
                  
                  if (analyzeRes.ok) {
                    const analyzeData = await analyzeRes.json();
                    setNoCodePercentage(analyzeData.no_code_percentage || 0);
                    setCustomCodePercentage(analyzeData.custom_code_percentage || 0);
                    setDetectedTools(analyzeData.detected_tools || []);
                  }
                  await fetchProfileMetrics(user.id);
                } catch (err) {
                  console.error("Failed to run repo tools breakdown:", err);
                }
              }
              
              // Clear form and return to dashboard overview
              setProgressNote("");
              setGithubLink("");
              setLoomLink("");
              setErrorMessage("");
              
              if (pollData.status !== "insufficient") {
                setActiveTab("Overview");
              }
            }
          } catch (pollErr) {
            console.error("Error polling status:", pollErr);
          }
        }, 2000);
      } else {
        // Show validator feedback
        alert(resData.feedback);

        if (resData.status === "complete") {
          setCompleted(true);
        }

        // Sync metrics, submissions and leaderboard
        await fetchProfileMetrics(user.id);
        await fetchSubmissions(user.id, isAdmin);
        await fetchLeaderboard();

        // Trigger tools usage breakdown analysis if validated complete and github url exists
        if (resData.status === "complete" && githubLink.trim()) {
          try {
            const analyzeRes = await fetch("/api/analyze-repo", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                github_url: githubLink.trim(),
                user_id: user.id,
                challenge_id: challengeTitle
              })
            });

            if (analyzeRes.ok) {
              const analyzeData = await analyzeRes.json();
              setNoCodePercentage(analyzeData.no_code_percentage || 0);
              setCustomCodePercentage(analyzeData.custom_code_percentage || 0);
              setDetectedTools(analyzeData.detected_tools || []);
            }
            await fetchProfileMetrics(user.id);
          } catch (err) {
            console.error("Failed to run repo tools breakdown:", err);
          }
        }

        // Clear form and return to dashboard overview
        setProgressNote("");
        setGithubLink("");
        setLoomLink("");
        setErrorMessage("");
        
        if (resData.status !== "insufficient") {
          setActiveTab("Overview");
        }
      }
    } catch (err: any) {
      console.error("Failed to upload proof:", err);
      setErrorMessage(err.message || "Failed to upload proof. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const getLocalDateStringFromISO = (isoString: string) => {
    const d = new Date(isoString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getBuilderName = (builderId: string) => {
    if (builderId === user?.id) {
      return user.profile?.name || user.email?.split("@")[0] || "You";
    }
    const found = leaderboardList.find(p => p.id === builderId);
    if (found) {
      return `Builder #${found.id.slice(0, 4)}`;
    }
    return `Builder #${builderId.slice(0, 4)}`;
  };

  const getSignalLabel = (name: string) => {
    switch (name) {
      case "repo_has_commits": return "Repository has commits";
      case "repo_has_readme": return "Repository contains README.md";
      case "last_commit_within_48hrs": return "Recent activity (last commit within 48h)";
      case "file_count_gt_2": return "File count greater than 2";
      case "commit_count_gt_1": return "Commit count greater than 1";
      case "word_count_gt_50": return "Word count greater than 50 words";
      case "contains_url_or_link": return "Contains a URL or link";
      case "char_length_gt_200": return "Description length greater than 200 characters";
      case "file_is_not_empty": return "File size is greater than 0 bytes";
      case "file_type_valid": return "File type is valid";
      default: return name;
    }
  };


  const handleDeleteSubmission = async (subId: string, userId: string, createdAt: string) => {
    if (!confirm("Are you sure you want to delete this submission and its matching completion history?")) {
      return;
    }
    setLoading(true);
    try {
      const completedDate = getLocalDateStringFromISO(createdAt);
      
      const { error: subDeleteError } = await insforge.database
        .from("submissions")
        .delete()
        .eq("id", subId);
      
      if (subDeleteError) throw subDeleteError;
      
      const { error: historyDeleteError } = await insforge.database
        .from("completion_history")
        .delete()
        .eq("user_id", userId)
        .eq("completed_date", completedDate);
      
      if (historyDeleteError) throw historyDeleteError;
      
      const datesInRange: string[] = [];
      const todayDateObj = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(todayDateObj);
        d.setDate(d.getDate() - i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        datesInRange.push(`${year}-${month}-${day}`);
      }

      const { data: historyData, error: historyFetchError } = await insforge.database
        .from("completion_history")
        .select("completed_date")
        .eq("user_id", userId)
        .in("completed_date", datesInRange);

      if (historyFetchError) throw historyFetchError;

      const completedDaysLast7 = historyData ? historyData.length : 0;
      const nextHealth = Math.floor((completedDaysLast7 / 7) * 100);
      const nextConsistency = nextHealth / 100;

      const { data: allHistory, error: allHistoryError } = await insforge.database
        .from("completion_history")
        .select("completed_date")
        .eq("user_id", userId)
        .order("completed_date", { ascending: false });

      if (allHistoryError) throw allHistoryError;

      let nextStreak = 0;
      let completedToday = false;
      if (allHistory && allHistory.length > 0) {
        const today = getLocalDateString();
        const yesterday = getYesterdayDateString();
        const latestDate = allHistory[0].completed_date;
        if (latestDate === today || latestDate === yesterday) {
          if (latestDate === today) {
            completedToday = true;
          }
          nextStreak = 1;
          for (let i = 1; i < allHistory.length; i++) {
            const prev = new Date(allHistory[i - 1].completed_date);
            const curr = new Date(allHistory[i].completed_date);
            const diffTime = Math.abs(prev.getTime() - curr.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
              nextStreak++;
            } else if (diffDays > 1) {
              break;
            }
          }
        }
      }

      const { error: profileUpdateError } = await insforge.database
        .from("profiles")
        .update({
          streak_count: nextStreak,
          completed: completedToday,
          streak_health: nextHealth,
          consistency: nextConsistency,
          last_completed_date: allHistory && allHistory.length > 0 ? allHistory[0].completed_date : null,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId);

      if (profileUpdateError) throw profileUpdateError;

      try {
        await fetch("/api/analyze-repo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            github_url: null,
            user_id: userId,
            challenge_id: challengeTitle
          })
        });
      } catch (err) {
        console.error("Failed to run stats recalculation in api/analyze-repo:", err);
      }

      alert("Submission and completion history deleted successfully.");
      if (user) {
        await fetchProfileMetrics(user.id);
        await fetchSubmissions(user.id, isAdmin);
      }
      await fetchLeaderboard();
    } catch (err: any) {
      console.error("Failed to delete submission:", err);
      alert(err.message || "Failed to delete submission. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleModUpdate = async (action: "reset" | "set") => {
    if (!modBuilder) return;
    
    setLoading(true);
    try {
      let nextStreak = modBuilder.streak;
      let nextCompleted = modBuilder.completed;
      
      if (action === "reset") {
        nextStreak = 0;
        nextCompleted = false;
      } else {
        const parsed = parseInt(modStreakInput);
        if (isNaN(parsed) || parsed < 0) {
          alert("Please enter a valid non-negative integer for streak.");
          setLoading(false);
          return;
        }
        nextStreak = parsed;
      }
      
      const { error } = await insforge.database
        .from("profiles")
        .update({
          streak_count: nextStreak,
          completed: nextCompleted,
          updated_at: new Date().toISOString()
        })
        .eq("id", modBuilder.id);
        
      if (error) throw error;
      
      alert(`Builder streak updated to ${nextStreak}.`);
      setModBuilder(null);
      
      if (user) {
        await fetchProfileMetrics(user.id);
        await fetchSubmissions(user.id, isAdmin);
      }
      await fetchLeaderboard();
    } catch (err: any) {
      console.error("Moderation update failed:", err);
      alert(err.message || "Failed to update profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const challengeDescription = `Design and implement the automation workflow: "${challengeTitle}". Integrate it with your local development stack and verify your daily execution stream.`;


  // Math for SVG Gauges (Radius 40, Sweep 270 degrees, length = 188.5)
  const pathD = "M 20 80 A 40 40 0 1 1 80 80";
  const pathLength = 188.5;
  
  const consistencyOffset = pathLength * (1 - consistency);
  const successOffset = pathLength * (1 - health);

  const handleUpload = () => {
    setActiveTab("Upload Proof");
  };

  const completeChallenge = () => {
    setActiveTab("Upload Proof");
  };

  const mockBuilders = [
    { id: "b-1", name: "Automation God", streak: 34, consistency: 0.99, health: 0.95 },
    { id: "b-2", name: "n8n_ninja", streak: 23, consistency: 0.92, health: 0.88 },
    { id: "b-3", name: "flow_master", streak: 18, consistency: 0.88, health: 0.82 },
    { id: "b-4", name: "webhook_wizard", streak: 10, consistency: 0.78, health: 0.72 },
    { id: "b-5", name: "script_slayer", streak: 8, consistency: 0.75, health: 0.68 },
  ];

  const dbBuilders = leaderboardList.map((p: any) => ({
    id: p.id,
    name: p.id === user?.id ? (user.profile?.name || user.email?.split("@")[0] || "You") : `Builder #${p.id.slice(0, 4)}`,
    streak: p.streak_count || 0,
    consistency: Number(p.consistency) || 0,
    health: (Number(p.streak_health) || 0) / 100
  }));

  const mergedBuilders = [...dbBuilders];
  mockBuilders.forEach(mock => {
    const isUser = user && (user.profile?.name === mock.name || user.email?.split("@")[0] === mock.name);
    if (!isUser && !mergedBuilders.some(b => b.name === mock.name)) {
      mergedBuilders.push(mock);
    }
  });
  
  if (!user && !mergedBuilders.some(b => b.id === "user")) {
    mergedBuilders.push({ id: "user", name: "Builder #204 (Guest)", streak, consistency, health });
  }

  const buildersList = mergedBuilders.sort((a, b) => b.streak - a.streak);

  return (
    <div className={styles.container}>
      {/* Tablet Frame matching Dribbble Mockup */}
      <div className={styles.tabletFrame}>
        
        {/* Header Navigation */}
        <header className={styles.header}>
          <div className={styles.logo} id="app-logo">
            <span className={styles.logoDot} />
            AUTO STREAK
          </div>
          
          <nav className={styles.navTabs}>
            {["Overview", "Daily Streak", "Workflows", "Upload Proof", "Leaderboard"].map((tab) => (
              <button
                key={tab}
                className={`${styles.navTab} ${activeTab === tab ? styles.navTabActive : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <button 
              className={styles.iconButton} 
              onClick={() => setShowNotification(false)}
              title="Notifications"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              {showNotification && <span className={styles.notificationDot} />}
            </button>
            
            {user ? (
              <div className={styles.userProfile} onClick={handleLogout} title="Click to Sign Out" style={{ cursor: 'pointer' }}>
                <div className={styles.avatar}>
                  <span>{user.profile?.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}</span>
                </div>
                <span className={styles.username}>
                  {user.profile?.name || user.email?.split("@")[0]}
                  {isAdmin && <span className={styles.adminBadge}>Admin</span>}
                  {" "}(Sign Out)
                </span>
              </div>

            ) : (
              <button 
                className={styles.submitBtn} 
                style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}
                onClick={() => {
                  setAuthError("");
                  setShowAuthModal(true);
                }}
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* Dashboard Content */}
        {activeTab === "Overview" ? (
          <main className={styles.main}>
            
            {/* Left Large Banner Card */}
            <section className={`${styles.card} ${styles.heroCard} ${styles.heroWidget}`} id="today-challenge-section">
              <span className={styles.heroTag}>Today's Challenge</span>
              <div className={styles.heroContent}>
                <h1 className={styles.heroTitle}>Smart Automation</h1>
                <p className={styles.heroSubtitle}>
                  Stay consistent. Build daily. Automate the mundane. Today's task: <strong>{challengeTitle}</strong>.
                </p>
                
                <button
                  className={styles.generateButton}
                  onClick={fetchChallenge}
                  disabled={loading}
                  id="generate-challenge-btn"
                >
                  {loading ? "Generating..." : "Generate Challenge"}
                </button>
              </div>
              
              {/* 3D Asset Illustration Container */}
              <div className={styles.heroImageContainer}>
                <img 
                  src="/smart_automation.png" 
                  alt="3D Automation Illustration" 
                  className={styles.heroImage}
                />
              </div>

              {/* Bottom mini challenge card inside hero card */}
              <div className={styles.challengePreview}>
                <div className={styles.challengePreviewTitle}>Current Task Details</div>
                <div className={styles.challengePreviewDesc}>
                  {challengeDescription}
                </div>
                <div style={{ marginTop: '0.85rem', display: 'flex' }}>
                  {completed ? (
                    <span className={styles.completedBadge} id="completed-badge">
                      ✅ Challenge Completed! (+1 Streak)
                    </span>
                  ) : (
                    <button
                      className={styles.completeButton}
                      onClick={completeChallenge}
                      id="complete-challenge-btn"
                    >
                      Complete Today's Challenge
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Streak Consistency Gauge Widget */}
            <section className={`${styles.card} ${styles.consistencyWidget}`} id="streak-count-section">
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Streak Consistency</h2>
                <button className={styles.drilldownButton} title="Details" onClick={() => setActiveTab("Daily Streak")}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </button>
              </div>
              
              <div className={styles.metricLayout}>
                <div className={styles.metricValueBlock}>
                  <span className={styles.trendPill} style={{ color: '#007aff', background: '#e5f1ff' }}>
                    <span className={styles.trendIcon}>▲</span> +5.1%
                  </span>
                  <span className={styles.metricNumber}>{Math.round(consistency * 100)}%</span>
                </div>

                <div className={styles.chartContainer}>
                  <svg className={styles.gaugeSvg}>
                    <path 
                      d={pathD} 
                      className={styles.gaugeTrack} 
                    />
                    <path 
                      d={pathD} 
                      className={`${styles.gaugeIndicator} ${styles.gaugeIndicatorBlue}`}
                      strokeDasharray={pathLength}
                      strokeDashoffset={consistencyOffset}
                    />
                  </svg>
                </div>
              </div>
            </section>

            {/* Challenge Success Gauge Widget */}
            <section className={`${styles.card} ${styles.successWidget}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Streak Health</h2>
                <button className={styles.drilldownButton} title="Details" onClick={() => setActiveTab("Daily Streak")}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </button>
              </div>
              
              <div className={styles.metricLayout}>
                <div className={styles.metricValueBlock}>
                  <span className={styles.trendPill} style={{ color: '#ff9500', background: '#ffeed5' }}>
                    <span className={styles.trendIcon}>▼</span> -2.3%
                  </span>
                  <span className={styles.metricNumber}>{Math.round(health * 100)}%</span>
                </div>

                <div className={styles.chartContainer}>
                  <svg className={styles.gaugeSvg}>
                    <path 
                      d={pathD} 
                      className={styles.gaugeTrack} 
                    />
                    <path 
                      d={pathD} 
                      className={`${styles.gaugeIndicator} ${styles.gaugeIndicatorOrange}`}
                      strokeDasharray={pathLength}
                      strokeDashoffset={successOffset}
                    />
                  </svg>
                </div>
              </div>
            </section>

            {/* Workflow Stacks (No-Code vs Code Split) Widget */}
            <section className={`${styles.card} ${styles.stacksWidget}`} id="upload-proof-section">
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Workflow Stacks</h2>
                <button className={styles.drilldownButton} title="Upload Proof" onClick={handleUpload}>
                  <span style={{ fontSize: '1.25rem', lineHeight: 1, fontWeight: 'bold' }}>+</span>
                </button>
              </div>
              
              <div className={styles.stackSplitGrid}>
                <div className={styles.stackChart}>
                  <div className={styles.stackBarGroup}>
                    <div className={`${styles.stackBar} ${styles.stackBarBlue}`} style={{ height: `${noCodePercentage}%` }} />
                    <span className={styles.stackValueLabel}>{noCodePercentage}%</span>
                  </div>
                  <div className={styles.stackBarGroup}>
                    <div className={`${styles.stackBar} ${styles.stackBarOrange}`} style={{ height: `${customCodePercentage}%` }} />
                    <span className={styles.stackValueLabel}>{customCodePercentage}%</span>
                  </div>
                </div>

                <div className={styles.stackMetaList}>
                  <div className={styles.stackMetaItem}>
                    <span className={styles.stackMetaLabel}>
                      <span className={`${styles.legendDot} ${styles.legendDotBlue}`} />
                      No-Code integrations
                    </span>
                    <span className={styles.stackMetaValue}>{noCodePercentage}%</span>
                  </div>
                  <div className={styles.stackMetaItem}>
                    <span className={styles.stackMetaLabel}>
                      <span className={`${styles.legendDot} ${styles.legendDotOrange}`} />
                      Custom API Scripts
                    </span>
                    <span className={styles.stackMetaValue}>{customCodePercentage}%</span>
                  </div>
                  <div className={styles.stackMetaItem}>
                    <span className={styles.stackMetaLabel}>Active streak duration</span>
                    <span className={styles.stackMetaValue} style={{ color: '#007aff' }}>{streak} Days</span>
                  </div>
                  {detectedTools.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '6px', width: '100%' }}>
                      {detectedTools.map((tool, index) => (
                        <span key={index} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Ground Leveling Status (Streak History Widget) */}
            <section className={`${styles.card} ${styles.historyWidget}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Streak History</h2>
                <span className={styles.historyTime}>
                  Consistency <span className={styles.historyTimeHighlight}>+1.8%</span>
                </span>
              </div>

              <div className={styles.historyLayout}>
                <div className={styles.historyBarChart}>
                  {/* 14 bars, with dynamic active lighting based on streak */}
                  {Array.from({ length: 14 }).map((_, idx) => (
                    <div 
                      key={idx}
                      className={`${styles.historyBar} ${idx < streak ? styles.historyBarActive : ""}`}
                      style={{ 
                        // Varying heights slightly for aesthetic depth
                        height: `${30 + (idx % 3) * 20}%` 
                      }}
                    />
                  ))}
                </div>

                {/* Today's Activity Feed */}
                <div className={styles.activityFeed}>
                  <div className={styles.activityFeedTitle}>Today's Activity</div>
                  <div className={styles.activityFeedContent}>
                    {submissions.length > 0 && (submissions[0].date === new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) || completed) ? (
                      <div className={styles.activityFeedItem}>
                        <span className={styles.activityFeedCheck}>
                          {!submissions[0].validationStatus || submissions[0].validationStatus === "complete" ? "✅" : submissions[0].validationStatus === "in_progress" ? "⚠️" : "❌"}
                        </span>
                        <div className={styles.activityFeedText}>
                          <strong>
                            {!submissions[0].validationStatus || submissions[0].validationStatus === "complete" 
                              ? "Challenge completed:" 
                              : submissions[0].validationStatus === "in_progress" 
                                ? "Challenge in progress:" 
                                : "Challenge validation failed:"}
                          </strong>{" "}
                          {submissions[0].challengeTitle || challengeTitle}
                          <br />
                          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {submissions[0].validatorFeedback || submissions[0].note || "Proof submitted successfully."}
                          </span>
                          {submissions[0].githubLink && (
                            <div style={{ marginTop: '4px' }}>
                              <a href={submissions[0].githubLink} target="_blank" rel="noopener noreferrer" style={{ color: '#007aff', fontSize: '0.75rem', textDecoration: 'underline' }}>
                                View GitHub Code
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.activityFeedItemPending}>
                        <span className={styles.activityFeedCheck}>⏳</span>
                        <div className={styles.activityFeedText}>
                          Awaiting today's build completion...
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </section>

            {/* Daily Streak Executions Widget */}
            <section className={`${styles.card} ${styles.volumeWidget}`}>
              <div className={styles.executionsWidgetLayout}>
                <div className={styles.executionsNumberBlock}>
                  <span className={styles.executionsLabel}>Executions / Hr</span>
                  <div className={styles.executionsValue}>{executionsPerHour.toFixed(2)}</div>
                </div>
                
                <div className={styles.volumeBarChart}>
                  {/* 20 fine gradient orange bars, varying heights */}
                  {[40, 20, 60, 80, 50, 70, 90, 85, 45, 30, 65, 80, 95, 75, 40, 30, 20, 10, 5, 0].map((height, idx) => (
                    <div 
                      key={idx} 
                      className={`${styles.volumeBar} ${height === 0 ? styles.volumeBarEmpty : ""}`}
                      style={{ height: height > 0 ? `${height}%` : undefined }}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* Progress Velocity Widget */}
            <section className={`${styles.card} ${styles.velocityWidget}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Submission Velocity</h2>
              </div>
              
              <div className={styles.velocityLayout}>
                <div className={styles.velocityLegend}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#007aff' }} />
                    Planned
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ff9500' }} />
                    Actual
                  </span>
                </div>

                <div className={styles.velocityMetricBlock}>
                  <span className={styles.velocityPct}>{velocityChange >= 0 ? "+" : ""}{velocityChange.toFixed(1)}%</span>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '-4px', marginBottom: '8px', textTransform: 'capitalize' }}>
                    Trend: <strong>{velocityTrend}</strong>
                  </div>
                  <div className={styles.velocityChart}>
                    {/* Pair bars for velocity */}
                    {[
                      { p: 80, a: 60, label: "Wk -3" },
                      { p: 90, a: 70, label: "Wk -2" },
                      { p: 70, a: 80, label: "Last Wk" },
                      { p: Math.round((velocityLastWeek / Math.max(velocityLastWeek, velocityThisWeek, 1)) * 80) + 10, a: Math.round((velocityThisWeek / Math.max(velocityLastWeek, velocityThisWeek, 1)) * 80) + 10, label: "This Wk" }
                    ].map((pair, idx) => (
                      <div key={idx} className={styles.velocityBarGroup} title={pair.label}>
                        <div className={`${styles.velocityBar} ${styles.velocityBarBlue}`} style={{ height: `${pair.p}%` }} />
                        <div className={`${styles.velocityBar} ${styles.velocityBarOrange}`} style={{ height: `${pair.a}%` }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </main>
        ) : (
          <main style={{ flex: 1, padding: "2rem", background: "#fafafb", display: "block" }}>
            
            {/* Upload Proof Form */}
            {activeTab === "Upload Proof" && (
              <div className={styles.tabContent}>
                <form onSubmit={handleSubmitProof} className={styles.formGrid}>
                  <div className={styles.formHeader}>
                    <h2 className={styles.formTitle}>Upload Proof of Work</h2>
                    <p className={styles.formSubtitle}>
                      Submit a GitHub repo or Loom link along with a progress note to validate your streak.
                    </p>
                  </div>

                  {errorMessage && (
                    <div style={{ color: '#e11d48', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      {errorMessage}
                    </div>
                  )}

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Today's Task</label>
                    <input 
                      type="text" 
                      className={styles.fieldInput} 
                      value={challengeTitle} 
                      disabled 
                      style={{ opacity: 0.7, cursor: 'not-allowed' }}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Progress Note *</label>
                    <textarea
                      className={`${styles.fieldInput} ${styles.fieldTextarea}`}
                      placeholder="What did you build today? E.g., Finished implementing n8n webhook listener logic..."
                      value={progressNote}
                      onChange={(e) => setProgressNote(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>GitHub Link</label>
                    <input
                      type="url"
                      className={styles.fieldInput}
                      placeholder="https://github.com/username/repo"
                      value={githubLink}
                      onChange={(e) => setGithubLink(e.target.value)}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Loom/Demo Link</label>
                    <input
                      type="url"
                      className={styles.fieldInput}
                      placeholder="https://loom.com/share/..."
                      value={loomLink}
                      onChange={(e) => setLoomLink(e.target.value)}
                    />
                  </div>

                  <button type="submit" className={styles.submitBtn}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    Validate & Ship Proof
                  </button>
                </form>
              </div>
            )}

            {/* Daily Streak List */}
            {activeTab === "Daily Streak" && (
              <div className={styles.tabContent}>
                <div className={styles.submissionsContainer}>
                  <div className={styles.formHeader} style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 className={styles.formTitle}>Daily Streak Validation Feed</h2>
                    <p className={styles.formSubtitle}>Verify your shipped proof-of-work streak history.</p>
                  </div>

                  {submissions.length === 0 ? (
                    <div className={styles.placeholderCard}>
                      <div className={styles.placeholderTitle}>No submissions yet</div>
                      <p className={styles.placeholderDesc}>Start building and upload your first proof of work to see it here!</p>
                      <button className={styles.submitBtn} onClick={() => setActiveTab("Upload Proof")}>
                        Upload Proof
                      </button>
                    </div>
                  ) : (
                    submissions.map((sub) => (
                      <div 
                        key={sub.id} 
                        className={styles.submissionCard}
                        onClick={() => setSelectedSubmission(sub)}
                      >

                        <div className={styles.submissionHeader}>
                          <span className={styles.submissionDate}>
                            {sub.date}
                            {isAdmin && ` — Builder: ${getBuilderName(sub.userId)}`}
                          </span>
                          <div className={styles.submissionMeta}>
                            {sub.githubLink && <span className={`${styles.submissionBadge} ${styles.badgeGithub}`}>GitHub</span>}
                            {sub.loomLink && <span className={`${styles.submissionBadge} ${styles.badgeLoom}`}>Loom</span>}
                            {!sub.validationStatus || sub.validationStatus === "complete" ? (
                              <span className={`${styles.submissionBadge} ${styles.badgeStatusComplete}`}>Complete</span>
                            ) : sub.validationStatus === "in_progress" ? (
                              <span className={`${styles.submissionBadge} ${styles.badgeStatusInProgress}`}>In Progress</span>
                            ) : (
                              <span className={`${styles.submissionBadge} ${styles.badgeStatusInsufficient}`}>Insufficient</span>
                            )}
                            {isAdmin && (
                              <button
                                className={styles.deleteSubBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSubmission(sub.id, sub.userId, sub.createdAt);
                                }}
                                title="Delete Submission"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>
                          Challenge: {sub.challengeTitle}
                        </div>
                        <p className={styles.submissionNote}>{sub.note}</p>
                        {(sub.githubLink || sub.loomLink) && (
                          <div className={styles.submissionLinks}>
                            {sub.githubLink && (
                              <a href={sub.githubLink} target="_blank" rel="noopener noreferrer" className={styles.submissionLink} onClick={(e) => e.stopPropagation()}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                                </svg>
                                GitHub Repo
                              </a>
                            )}
                            {sub.loomLink && (
                              <a href={sub.loomLink} target="_blank" rel="noopener noreferrer" className={styles.submissionLink} onClick={(e) => e.stopPropagation()}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 7a2 2 0 0 0-2.45-1.45L16 7V5a2 2 0 0 0-2-2H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2l4.55 1.45A2 2 0 0 0 23 17V7z"></path>
                                </svg>
                                Loom / Demo
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Leaderboard Table */}
            {activeTab === "Leaderboard" && (
              <div className={styles.tabContent}>
                <div className={styles.formGrid} style={{ maxWidth: '850px' }}>
                  <div className={styles.formHeader}>
                    <h2 className={styles.formTitle}>Global Builder Leaderboard</h2>
                    <p className={styles.formSubtitle}>Compete with other automation builders. Shipped work only.</p>
                  </div>

                  <table className={styles.leaderboardTable}>
                    <thead>
                      <tr>
                        <th className={styles.leaderboardHeaderCell}>Rank</th>
                        <th className={styles.leaderboardHeaderCell}>Builder</th>
                        <th className={styles.leaderboardHeaderCell}>Active Streak</th>
                        <th className={styles.leaderboardHeaderCell}>Consistency</th>
                        <th className={styles.leaderboardHeaderCell}>Streak Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildersList.map((builder, index) => {
                        const rank = index + 1;
                        const isUser = builder.id === "user";
                        const isDbBuilder = !builder.id.startsWith("b-") && builder.id !== "user";
                        return (
                          <tr 
                            key={builder.id} 
                            className={styles.leaderboardRow}
                            onClick={() => {
                              if (isAdmin && isDbBuilder) {
                                setModBuilder(builder);
                                setModStreakInput(builder.streak.toString());
                              }
                            }}
                            style={{
                              ...(isUser ? { background: '#f0f9ff', fontWeight: 'bold', borderLeft: '4px solid #007aff' } : {}),
                              ...(isAdmin && isDbBuilder ? { cursor: 'pointer' } : {})
                            }}
                          >

                            <td className={styles.leaderboardCell}>
                              <span className={`${styles.rankBadge} ${rank === 1 ? styles.rank1 : rank === 2 ? styles.rank2 : rank === 3 ? styles.rank3 : ""}`}>
                                {rank}
                              </span>
                            </td>
                            <td className={styles.leaderboardCell}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {isUser && <span style={{ fontSize: '1.1rem' }}>⚡</span>}
                                {builder.name}
                              </div>
                            </td>
                            <td className={styles.leaderboardCell}>{builder.streak} days</td>
                            <td className={styles.leaderboardCell}>{Math.round(builder.consistency * 100)}%</td>
                            <td className={styles.leaderboardCell}>
                              <span style={{ color: builder.health > 0.8 ? '#16a34a' : '#ea580c' }}>
                                {Math.round(builder.health * 100)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Workflows List */}
            {activeTab === "Workflows" && (
              <div className={styles.tabContent}>
                <div style={{ maxWidth: '900px', margin: '1.5rem auto' }}>
                  <div className={styles.formHeader} style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 className={styles.formTitle}>Active Workflows & Automations</h2>
                    <p className={styles.formSubtitle}>Your live production streams and automated helpers.</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div className={styles.submissionCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#16a34a', background: '#dcfce7', padding: '0.25rem 0.5rem', borderRadius: '6px' }}>ACTIVE</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Executions: 1,240</span>
                      </div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem', color: '#0f172a' }}>GitHub Issues webhook to Telegram</h3>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.5rem 0 1rem 0' }}>
                        Listens for incoming issues on designated repos, formats critical metadata, and pushes notifications directly to Telegram chat.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        <span style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>n8n</span>
                        <span style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>Webhooks</span>
                        <span style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>API</span>
                      </div>
                    </div>

                    <div className={styles.submissionCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#16a34a', background: '#dcfce7', padding: '0.25rem 0.5rem', borderRadius: '6px' }}>ACTIVE</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Executions: 852</span>
                      </div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem', color: '#0f172a' }}>Daily Database Consistency Check</h3>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.5rem 0 1rem 0' }}>
                        Automated check verifying streak syncs across the backend system. Runs at midnight.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        <span style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>TypeScript</span>
                        <span style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>Cron</span>
                        <span style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>Database</span>
                      </div>
                    </div>

                    <div className={styles.submissionCard} style={{ opacity: 0.7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', background: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '6px' }}>DRAFT</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Executions: 0</span>
                      </div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem', color: '#0f172a' }}>AI agent for automated code reviews</h3>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.5rem 0 1rem 0' }}>
                        Draft pipeline to test PR validations. Deferring backend logic for MVP.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        <span style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>LLM API</span>
                        <span style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>Git Hooks</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        )}

        {/* Footer */}
        <footer className={styles.footer}>
          <span>© 2026 Auto Streak App. Crafted for AI Builders.</span>
          <div className={styles.footerActions}>
            <a href="#" className={styles.footerLink}>Terms of Service</a>
            <a href="#" className={styles.footerLink}>Privacy Policy</a>
          </div>
        </footer>

      </div>

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalGlow} />
            <span className={styles.modalTag}>⚡ CHALLENGE UNLOCKED</span>
            <h2 className={styles.modalTitle}>{challengeTitle}</h2>
            <p className={styles.modalDescription}>
              Design and implement the automation workflow: <strong>{challengeTitle}</strong>. Integrate this logic with your workspace stack and upload your proof to continue your build streak.
            </p>
            <div className={styles.modalMeta}>
              <div className={styles.modalMetaItem}>
                <span className={styles.modalMetaLabel}>DIFFICULTY</span>
                <span className={styles.modalMetaValue} style={{ color: '#ff9500' }}>Medium</span>
              </div>
              <div className={styles.modalMetaItem}>
                <span className={styles.modalMetaLabel}>EST. TIME</span>
                <span className={styles.modalMetaValue}>45 mins</span>
              </div>
            </div>
            <button className={styles.modalButton} onClick={() => setShowModal(false)}>
              Let's Build!
            </button>
          </div>
        </div>
      )}
      {showAuthModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAuthModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className={styles.modalGlow} />
            <div className={styles.navTabs} style={{ marginBottom: '1rem', width: '100%', justifyContent: 'center' }}>
              <button 
                type="button"
                className={`${styles.navTab} ${authTab === 'login' ? styles.navTabActive : ''}`}
                onClick={() => { setAuthTab('login'); setAuthError(''); }}
                style={{ flex: 1 }}
              >
                Sign In
              </button>
              <button 
                type="button"
                className={`${styles.navTab} ${authTab === 'signup' ? styles.navTabActive : ''}`}
                onClick={() => { setAuthTab('signup'); setAuthError(''); }}
                style={{ flex: 1 }}
              >
                Sign Up
              </button>
            </div>

            <h2 className={styles.modalTitle}>
              {authTab === 'login' ? 'Welcome Back Builder' : 'Join the Streak Log'}
            </h2>
            <p className={styles.modalDescription}>
              {authTab === 'login' 
                ? 'Sign in to sync your streak consistency and log build proof.' 
                : 'Create an account to start tracking your shipped automation streaks.'}
            </p>

            {authError && (
              <div style={{ color: '#e11d48', fontSize: '0.8rem', fontWeight: 'bold', margin: '0.5rem 0' }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {authTab === 'signup' && (
                <div className={styles.fieldGroup} style={{ textAlign: 'left' }}>
                  <label className={styles.fieldLabel}>Display Name</label>
                  <input
                    type="text"
                    className={styles.fieldInput}
                    placeholder="E.g., n8n_ninja"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                  />
                </div>
              )}

              <div className={styles.fieldGroup} style={{ textAlign: 'left' }}>
                <label className={styles.fieldLabel}>Email Address *</label>
                <input
                  type="email"
                  className={styles.fieldInput}
                  placeholder="your@email.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>

              <div className={styles.fieldGroup} style={{ textAlign: 'left' }}>
                <label className={styles.fieldLabel}>Password *</label>
                <input
                  type="password"
                  className={styles.fieldInput}
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className={styles.modalButton} disabled={loading} style={{ marginTop: '0.5rem' }}>
                {loading ? 'Authenticating...' : authTab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}
      {modBuilder && (
        <div className={styles.modalOverlay} onClick={() => setModBuilder(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className={styles.modalGlow} />
            <span className={styles.modalTag}>🛡️ ADMIN MODERATION</span>
            <h2 className={styles.modalTitle}>Moderate Builder</h2>
            <p className={styles.modalDescription}>
              Adjusting metrics for <strong>{modBuilder.name}</strong> (ID: {modBuilder.id.slice(0, 8)}...).
            </p>
            
            <div className={styles.modalMeta} style={{ marginBottom: '1.5rem' }}>
              <div className={styles.modalMetaItem}>
                <span className={styles.modalMetaLabel}>CURRENT STREAK</span>
                <span className={styles.modalMetaValue} style={{ color: '#007aff' }}>{modBuilder.streak} Days</span>
              </div>
              <div className={styles.modalMetaItem}>
                <span className={styles.modalMetaLabel}>CONSISTENCY</span>
                <span className={styles.modalMetaValue}>{Math.round(modBuilder.consistency * 100)}%</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
              <div className={styles.fieldGroup} style={{ textAlign: 'left' }}>
                <label className={styles.fieldLabel}>Set Streak Count</label>
                <input 
                  type="number" 
                  min="0"
                  className={styles.fieldInput} 
                  value={modStreakInput}
                  onChange={(e) => setModStreakInput(e.target.value)}
                  placeholder="Enter streak count"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
                <button 
                  className={styles.modalButton} 
                  style={{ flex: 1, background: '#ef4444', border: 'none', cursor: 'pointer' }}
                  onClick={() => handleModUpdate("reset")}
                >
                  Reset Streak
                </button>
                <button 
                  className={styles.modalButton} 
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => handleModUpdate("set")}
                >
                  Save Streak
                </button>
              </div>
              
              <button 
                className={styles.modalButton} 
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', marginTop: '0.5rem', cursor: 'pointer' }}
                onClick={() => setModBuilder(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedSubmission && (
        <div className={styles.modalOverlay} onClick={() => setSelectedSubmission(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className={styles.modalGlow} />
            <span className={styles.modalTag}>🔎 SUBMISSION DETAILS</span>
            <h2 className={styles.modalTitle} style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
              {selectedSubmission.challengeTitle}
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem', marginTop: '-0.25rem' }}>
              Submitted on: {selectedSubmission.date}
            </p>

            <div className={styles.modalMeta} style={{ marginBottom: '1rem' }}>
              <div className={styles.modalMetaItem}>
                <span className={styles.modalMetaLabel}>VALIDATION STATUS</span>
                <span 
                  className={styles.modalMetaValue} 
                  style={{ 
                    color: !selectedSubmission.validationStatus || selectedSubmission.validationStatus === 'complete' 
                      ? '#16a34a' 
                      : selectedSubmission.validationStatus === 'in_progress' 
                        ? '#ea580c' 
                        : '#ef4444' 
                  }}
                >
                  {!selectedSubmission.validationStatus || selectedSubmission.validationStatus === 'complete' 
                    ? 'Complete' 
                    : selectedSubmission.validationStatus === 'in_progress' 
                      ? 'In Progress' 
                      : 'Insufficient'}
                </span>
              </div>
              <div className={styles.modalMetaItem}>
                <span className={styles.modalMetaLabel}>SCORE</span>
                <span className={styles.modalMetaValue} style={{ color: '#007aff' }}>
                  {selectedSubmission.validationScore !== undefined ? `${selectedSubmission.validationScore}/100` : 'N/A'}
                </span>
              </div>
            </div>

            <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Validator Feedback</label>
                <div style={{ 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  padding: '12px', 
                  borderRadius: '10px', 
                  fontSize: '0.85rem', 
                  color: 'var(--text-primary)',
                  lineHeight: '1.4'
                }}>
                  {selectedSubmission.validatorFeedback || "This submission was verified completed under the legacy scoring rules."}
                </div>
              </div>

              {selectedSubmission.missingElements && selectedSubmission.missingElements.length > 0 && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} style={{ color: '#ea580c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    ⚠️ Missing Elements to Complete Challenge
                  </label>
                  <div style={{ 
                    background: '#fff7ed', 
                    border: '1px solid #ffedd5', 
                    padding: '12px', 
                    borderRadius: '10px', 
                    fontSize: '0.85rem', 
                    color: '#c2410c',
                    lineHeight: '1.4',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    {selectedSubmission.missingElements.map((el: string, idx: number) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <span>•</span>
                        <span>{el}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedSubmission.note && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Submitted Note</label>
                  <div style={{ 
                    background: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    padding: '12px', 
                    borderRadius: '10px', 
                    fontSize: '0.85rem', 
                    color: 'var(--text-primary)',
                    lineHeight: '1.4'
                  }}>
                    {selectedSubmission.note}
                  </div>
                </div>
              )}

              {selectedSubmission.validationSignals && selectedSubmission.validationSignals.length > 0 && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Validation Signals Checklist</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                    {selectedSubmission.validationSignals.map((sig: any, index: number) => (
                      <div 
                        key={index}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '0.8rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{sig.passed ? "🟢" : "🔴"}</span>
                          <span>{getSignalLabel(sig.name)}</span>
                        </div>
                        <span style={{ fontWeight: '600', color: sig.passed ? '#16a34a' : '#94a3b8' }}>
                          +{sig.score}/{sig.maxScore}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button 
                className={styles.modalButton} 
                style={{ background: 'var(--color-blue)', color: '#fff', marginTop: '0.5rem', cursor: 'pointer' }}
                onClick={() => setSelectedSubmission(null)}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
      {isValidating && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard} style={{ maxWidth: '360px', textAlign: 'center' }}>
            <div className={styles.modalGlow} />
            <div className={styles.spinner} style={{ margin: '2rem auto 1.5rem auto' }} />
            <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              {validationMessage}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              AI agent is validating your repository against challenge requirements. This usually takes 2–5 seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


