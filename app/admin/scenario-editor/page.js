'use client';

import { useState, useEffect } from 'react';
import { useChatStore } from '../../store';
import styles from './page.module.css';
import Link from 'next/link';

// Icon Components
const PlusIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const ChevronDownIcon = ({ isRotated }) => (
    <svg style={{ transform: isRotated ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease-in-out' }} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);

export default function ScenarioEditorPage() {
    const scenarioCategories = useChatStore((state) => state.scenarioCategories);
    const saveScenarioCategories = useChatStore((state) => state.saveScenarioCategories);
    const showEphemeralToast = useChatStore((state) => state.showEphemeralToast);
    const availableScenarios = useChatStore((state) => state.availableScenarios);
    const loadAvailableScenarios = useChatStore((state) => state.loadAvailableScenarios);
    
    const [categories, setCategories] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    useEffect(() => {
        loadAvailableScenarios();
    }, [loadAvailableScenarios]);

    useEffect(() => {
        if (!scenarioCategories) {
            setCategories(null);
            return;
        }

        const categoriesCopy = JSON.parse(JSON.stringify(scenarioCategories));

        categoriesCopy.forEach(cat => {
            if (!Array.isArray(cat.subCategories)) {
                cat.subCategories = [];
            }
            cat.subCategories.forEach(subCat => {
                if (!Array.isArray(subCat.items)) {
                    subCat.items = [];
                }
                subCat.items.forEach(item => {
                    if (!item.action) {
                        item.action = { type: 'scenario', value: item.scenarioId || '' };
                        delete item.scenarioId;
                    }
                });
            });
        });
        setCategories(categoriesCopy);

    }, [scenarioCategories]);
    
    const toggleCollapse = (pathString) => {
        setCollapsedPaths(prev => {
            const newSet = new Set(prev);
            if (newSet.has(pathString)) {
                newSet.delete(pathString);
            } else {
                newSet.add(pathString);
            }
            return newSet;
        });
    };

    const handleSave = async () => {
        setIsLoading(true);
        const success = await saveScenarioCategories(categories);
        if (success) {
            showEphemeralToast('성공적으로 저장되었습니다.', 'success');
        } else {
            showEphemeralToast('저장에 실패했습니다. 콘솔을 확인해주세요.', 'error');
        }
        setIsLoading(false);
    };

    const handleInputChange = (path, field, value) => {
        setCategories(prev => {
            const newCategories = JSON.parse(JSON.stringify(prev));
            let parent = newCategories;
            for (let i = 0; i < path.length - 1; i++) {
                parent = parent[path[i]];
            }
            let target = parent[path[path.length - 1]];
            
            target[field] = value;

            if (field === 'type' && path.slice(-1)[0] === 'action') {
                target.value = '';
            }

            return newCategories;
        });
    };
    
    const addItem = (path, newItem) => {
        setCategories(prev => {
            const newCategories = JSON.parse(JSON.stringify(prev));
            let target = newCategories;
            for (const key of path) {
                target = target[key];
            }
            target.push(newItem);
            return newCategories;
        });
    };

    const deleteItem = (path) => {
         setCategories(prev => {
            const newCategories = JSON.parse(JSON.stringify(prev));
            let target = newCategories;
            for (let i = 0; i < path.length - 1; i++) {
                target = target[path[i]];
            }
            target.splice(path[path.length - 1], 1);
            return newCategories;
        });
    };
    
    if (!categories) {
        return <div className={styles.container}><h1>Loading Editor...</h1></div>;
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>Scenario Categories Editor</h1>
                <p>챗봇 입력창 좌측의 시나리오 메뉴를 편집합니다.</p>
                <Link href="/" className={styles.backLink}>← 챗봇으로 돌아가기</Link>
            </header>

            <main className={styles.editorContainer}>
                <div className={styles.tree}>
                    {categories.map((cat, catIndex) => {
                        const catPath = `${catIndex}`;
                        const isCatCollapsed = collapsedPaths.has(catPath);
                        return (
                            <div key={`cat-${catIndex}`} className={styles.categoryNode}>
                                <div className={styles.nodeHeader}>
                                    <button onClick={() => toggleCollapse(catPath)} className={styles.toggleButton}>
                                        <ChevronDownIcon isRotated={isCatCollapsed} />
                                        <h3>Category: {cat.name || '(Untitled)'}</h3>
                                    </button>
                                    <button onClick={() => deleteItem([catIndex])} className={styles.deleteButton}><TrashIcon /></button>
                                </div>
                                <div className={`${styles.collapsibleContent} ${isCatCollapsed ? styles.collapsed : ''}`}>
                                    <div className={styles.nodeContent}>
                                        <input type="text" value={cat.name} onChange={e => handleInputChange([catIndex], 'name', e.target.value)} placeholder="Category Name" className={styles.inputField}/>
                                        
                                        {cat.subCategories.map((subCat, subCatIndex) => {
                                            const subCatPath = `${catPath}.subCategories.${subCatIndex}`;
                                            const isSubCatCollapsed = collapsedPaths.has(subCatPath);
                                            return(
                                                <div key={`subcat-${subCatIndex}`} className={styles.subCategoryNode}>
                                                    <div className={styles.nodeHeader}>
                                                        <button onClick={() => toggleCollapse(subCatPath)} className={styles.toggleButton}>
                                                            <ChevronDownIcon isRotated={isSubCatCollapsed} />
                                                            <h4>Sub-Category: {subCat.title || '(Untitled)'}</h4>
                                                        </button>
                                                        <button onClick={() => deleteItem([catIndex, 'subCategories', subCatIndex])} className={styles.deleteButton}><TrashIcon /></button>
                                                    </div>
                                                    <div className={`${styles.collapsibleContent} ${isSubCatCollapsed ? styles.collapsed : ''}`}>
                                                        <div className={styles.nodeContent}>
                                                            <input type="text" value={subCat.title} onChange={e => handleInputChange([catIndex, 'subCategories', subCatIndex], 'title', e.target.value)} placeholder="Sub-Category Title" className={styles.inputField}/>
                                                            
                                                            {subCat.items.map((item, itemIndex) => (
                                                                <div key={`item-${itemIndex}`} className={styles.itemNode}>
                                                                    <div className={styles.nodeHeader}>
                                                                        <h5>Item</h5>
                                                                        <button onClick={() => deleteItem([catIndex, 'subCategories', subCatIndex, 'items', itemIndex])} className={styles.deleteButton}><TrashIcon /></button>
                                                                    </div>
                                                                    <div className={styles.nodeContent}>
                                                                        <input type="text" value={item.title} onChange={e => handleInputChange([catIndex, 'subCategories', subCatIndex, 'items', itemIndex], 'title', e.target.value)} placeholder="Item Title" className={styles.inputField}/>
                                                                        <input type="text" value={item.description} onChange={e => handleInputChange([catIndex, 'subCategories', subCatIndex, 'items', itemIndex], 'description', e.target.value)} placeholder="Description" className={styles.inputField}/>
                                                                        
                                                                        <div className={styles.actionContainer}>
                                                                            <select 
                                                                                value={item.action.type} 
                                                                                onChange={e => handleInputChange([catIndex, 'subCategories', subCatIndex, 'items', itemIndex, 'action'], 'type', e.target.value)}
                                                                                className={styles.selectField}
                                                                            >
                                                                                <option value="scenario">Scenario</option>
                                                                                <option value="custom">Custom Action</option>
                                                                            </select>

                                                                            {item.action.type === 'scenario' ? (
                                                                                <select 
                                                                                    value={item.action.value} 
                                                                                    onChange={e => handleInputChange([catIndex, 'subCategories', subCatIndex, 'items', itemIndex, 'action'], 'value', e.target.value)}
                                                                                    className={styles.selectField}
                                                                                >
                                                                                    <option value="">-- 시나리오 선택 --</option>
                                                                                    {availableScenarios.map(id => (
                                                                                        <option key={id} value={id}>{id}</option>
                                                                                    ))}
                                                                                </select>
                                                                            ) : (
                                                                                <input 
                                                                                    type="text" 
                                                                                    value={item.action.value} 
                                                                                    onChange={e => handleInputChange([catIndex, 'subCategories', subCatIndex, 'items', itemIndex, 'action'], 'value', e.target.value)} 
                                                                                    placeholder="Custom Action Name (e.g., GET_SCENARIO_LIST)" 
                                                                                    className={styles.inputField}
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            <button onClick={() => addItem([catIndex, 'subCategories', subCatIndex, 'items'], { title: "", description: "", action: { type: 'scenario', value: '' } })} className={styles.addButton}><PlusIcon /> Add Item</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        <button onClick={() => addItem([catIndex, 'subCategories'], { title: "", items: [] })} className={styles.addButton}><PlusIcon /> Add Sub-Category</button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    <button onClick={() => addItem([], { name: "", subCategories: [] })} className={styles.addButton}><PlusIcon /> Add Category</button>
                </div>

                <button className={styles.saveButton} onClick={handleSave} disabled={isLoading}>
                    {isLoading ? '저장 중...' : 'Firestore에 저장하기'}
                </button>
            </main>
        </div>
    );
}