'use client';

import { useChatStore } from '../store';
import styles from './FavoritePanel.module.css';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const PlusIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export default function FavoritePanel() {
    const favorites = useChatStore((state) => state.favorites);
    const isLoading = useChatStore((state) => state.isLoading);
    const handleShortcutClick = useChatStore((state) => state.handleShortcutClick);
    const updateFavoritesOrder = useChatStore((state) => state.updateFavoritesOrder);
    const setShortcutMenuOpen = useChatStore((state) => state.setShortcutMenuOpen);
    const scenarioCategories = useChatStore((state) => state.scenarioCategories);
    const deleteFavorite = useChatStore((state) => state.deleteFavorite);
    const maxFavorites = useChatStore((state) => state.maxFavorites);
    
    const onDragEnd = (result) => {
        if (!result.destination) return;

        const items = Array.from(favorites);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        updateFavoritesOrder(items);
    };

    const handleAddFavoriteClick = () => {
        if (scenarioCategories && scenarioCategories.length > 0) {
            setShortcutMenuOpen(scenarioCategories[0].name);
        }
    };
    
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

            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="favorites">
                    {(provided) => (
                        <div
                            className={styles.favoritesGrid}
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {favorites.map((fav, index) => (
                                <Draggable key={fav.id} draggableId={fav.id} index={index}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            className={`${styles.favoriteItem} ${snapshot.isDragging ? styles.dragging : ''}`}
                                        >
                                            <div
                                                {...provided.dragHandleProps}
                                                className={styles.dragHandle}
                                            >
                                                ⠿
                                            </div>
                                            <div className={styles.itemContent} onClick={() => handleShortcutClick(fav)}>
                                                <div className={styles.itemIcon}>{fav.icon || '🌟'}</div>
                                                <div className={styles.itemText}>
                                                    <div className={styles.itemTitle}>{fav.title}</div>
                                                    <div className={styles.itemDescription}>{fav.description}</div>
                                                </div>
                                            </div>
                                            <button 
                                                className={styles.deleteButton} 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteFavorite(fav.id);
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                            
                            {favorites.length < maxFavorites ? (
                                <button className={`${styles.favoriteItem} ${styles.addItem}`} onClick={handleAddFavoriteClick}>
                                    <div className={styles.addIcon}><PlusIcon/></div>
                                    <div className={styles.itemText}>
                                        <div className={styles.itemTitle}>Add Favorite</div>
                                        <div className={styles.itemDescription}>Customize via Shortcuts menu</div>
                                    </div>
                                </button>
                            ) : (
                                <div className={`${styles.favoriteItem} ${styles.limitReached}`}>
                                    <div className={styles.itemText}>
                                        <div className={styles.itemTitle}>Favorite Limit Reached</div>
                                        <div className={styles.itemDescription}>You can add up to {maxFavorites} items.</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </div>
    );
}