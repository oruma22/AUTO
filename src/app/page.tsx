import styles from "./dashboard.module.css";

export default function Home() {
  // Fake data for initial structure
  const currentStreak = 12;
  const challengeTitle = "Build an n8n webhook listener for GitHub issues";
  const challengeDescription = 
    "Design an n8n workflow that triggers whenever a new issue is opened in your GitHub repository. The workflow should parse the issue body, categorize the task using an AI prompt, and post a formatted summary alert to a Slack or Telegram channel.";

  return (
    <div className={styles.container}>
      {/* Premium Dashboard Header */}
      <header className={styles.header}>
        <div className={styles.logo} id="app-logo">
          AUTO STREAK
        </div>
        <div className={styles.userProfile}>
          <div className={styles.avatar} />
          <span className={styles.username}>Builder #204</span>
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className={styles.main}>
        <div className={styles.leftColumn}>
          <div>
            <h1 className={styles.dashboardTitle} id="dashboard-main-heading">
              Build Workspace
            </h1>
            <p className={styles.dashboardSubtitle}>
              Stay consistent. Build daily. Automate the mundane.
            </p>
          </div>

          {/* Today's Challenge Section */}
          <section 
            className={styles.card} 
            id="today-challenge-section" 
            aria-labelledby="challenge-heading"
          >
            <div className={styles.cardGlow} />
            <div className={styles.challengeHeader}>
              <span className={`${styles.badge} ${styles.badgeChallenge}`}>
                Today's Challenge
              </span>
              <span className={styles.difficultyBadge}>
                Difficulty: Medium
              </span>
            </div>
            
            <h2 className={styles.challengeTitle} id="challenge-heading">
              {challengeTitle}
            </h2>
            <p className={styles.challengeDescription}>
              {challengeDescription}
            </p>

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Estimated Time</span>
                <span className={styles.metaValue}>45 - 60 mins</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Recommended Stack</span>
                <span className={styles.metaValue}>n8n, OpenAI, Telegram API</span>
              </div>
            </div>
          </section>
        </div>

        <div className={styles.rightColumn}>
          {/* Streak Count Section */}
          <section 
            className={styles.card} 
            id="streak-count-section"
            aria-labelledby="streak-heading"
          >
            <div className={styles.cardGlow} />
            <h2 className={styles.streakLabel} id="streak-heading">
              Streak Count
            </h2>
            
            <div className={styles.streakCenter}>
              <div className={styles.streakCircle}>
                <div className={styles.streakGlowRing} />
                <span className={styles.streakFlame} role="img" aria-label="flame">
                  🔥
                </span>
              </div>
              <span className={styles.streakNumber}>{currentStreak}</span>
              <span className={styles.streakMessage}>
                Consecutive Days Active
              </span>
            </div>
          </section>

          {/* Upload Section */}
          <section 
            className={`${styles.card} ${styles.uploadContainer}`}
            id="upload-proof-section"
            aria-labelledby="upload-heading"
          >
            <div className={styles.cardGlow} />
            <h2 className={styles.streakLabel} id="upload-heading">
              Proof of Work
            </h2>
            
            <button 
              className={styles.uploadButton} 
              id="dashboard-upload-proof-btn"
              type="button"
            >
              <span className={styles.uploadIcon}>⬆</span>
              <span>Upload Proof</span>
            </button>
            
            <p className={styles.uploadHelper}>
              Accepts GitHub links, screenshots, or workflow JSON.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>© 2026 Auto Streak App. Crafted for AI Builders.</p>
      </footer>
    </div>
  );
}
