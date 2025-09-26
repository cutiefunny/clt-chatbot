'use client';

import { useChatStore } from '../store';
import styles from './FavoritePanel.module.css';

const PlusIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export default function FavoritePanel() {
    const { favorites, isLoading, handleShortcutClick, openShortcutPicker } = useChatStore();
    
    if (isLoading && favorites.length === 0) {
        return (
            <div className={styles.panel}>
                <div className={styles.welcomeMessage}>
                    <h2>Welcome to AI Chatbot</h2>
                    <p>Loading your favorites...</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className={styles.panel}>
            <div className={styles.welcomeMessage}>
                <h2>Welcome to AI Chatbot</h2>
                <p>You can customize your own action buttons below.</p>
            </div>

            <div className={styles.favoritesGrid}>
                {favorites.map((fav) => (
                    <button key={fav.id} className={styles.favoriteItem} onClick={() => handleShortcutClick(fav)}>
                        <div className={styles.itemIcon}>{fav.icon || '🌟'}</div>
                        <div className={styles.itemText}>
                            <div className={styles.itemTitle}>{fav.title}</div>
                            <div className={styles.itemDescription}>{fav.description}</div>
                        </div>
                    </button>
                ))}

                <button className={`${styles.favoriteItem} ${styles.addItem}`} onClick={openShortcutPicker}>
                    <div className={styles.addIcon}><PlusIcon/></div>
                    <div className={styles.itemText}>
                        <div className={styles.itemTitle}>Add Favorite</div>
                        <div className={styles.itemDescription}>Customize via Shortcuts menu</div>
                    </div>
                </button>
            </div>
        </div>
    );
}