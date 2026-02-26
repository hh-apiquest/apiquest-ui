// // KeyValueEditor - Base reusable component for key-value pairs
// // Used by Headers, Params, FormData editors

// import React, { useState, useRef, useEffect } from 'react';
// import * as Checkbox from '@radix-ui/react-checkbox';
// import { TrashIcon } from '@heroicons/react/24/outline';

// export interface KeyValueEditorProps {
//   data: Array<{ key: string; value: string; enabled: boolean }>;
//   onChange: (data: Array<{ key: string; value: string; enabled: boolean }>) => void;
//   placeholder?: { key: string; value: string };
//   allowDisable?: boolean;
//   allowDuplicates?: boolean;
//   // Optional callbacks for autocomplete suggestions
//   getKeySuggestions?: () => string[];
//   getValueSuggestions?: (key: string) => string[];
// }

// export function KeyValueEditor({
//   data,
//   onChange,
//   placeholder = { key: 'Key', value: 'Value' },
//   allowDisable = true,
//   allowDuplicates = true,
//   getKeySuggestions,
//   getValueSuggestions
// }: KeyValueEditorProps) {
//   const [focusedRow, setFocusedRow] = useState<number | null>(null);
//   const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
//   const pendingFocus = useRef<{ index: number; field: 'key' | 'value' } | null>(null);

//   useEffect(() => {
//     // Restore focus after a new row is created
//     if (pendingFocus.current) {
//       const { index, field } = pendingFocus.current;
//       const key = `${index}-${field}`;
//       const input = inputRefs.current.get(key);
//       if (input) {
//         input.focus();
//         // Move cursor to end
//         const length = input.value.length;
//         input.setSelectionRange(length, length);
//       }
//       pendingFocus.current = null;
//     }
//   }, [data.length]);

//   const handleChange = (index: number, field: 'key' | 'value', newValue: string) => {
//     const newData = [...data];
    
//     if (index >= newData.length) {
//       // Typing in the empty "add" row - create a new entry
//       newData.push({ 
//         key: field === 'key' ? newValue : '', 
//         value: field === 'value' ? newValue : '', 
//         enabled: true 
//       });
//       // Schedule focus restoration to the newly created row
//       pendingFocus.current = { index: newData.length - 1, field };
//     } else {
//       // Updating existing row
//       newData[index] = { ...newData[index], [field]: newValue };
//     }
    
//     onChange(newData);
//   };

//   const setInputRef = (index: number, field: 'key' | 'value', element: HTMLInputElement | null) => {
//     const key = `${index}-${field}`;
//     if (element) {
//       inputRefs.current.set(key, element);
//     } else {
//       inputRefs.current.delete(key);
//     }
//   };

//   const handleToggle = (index: number) => {
//     const newData = [...data];
//     newData[index] = { ...newData[index], enabled: !newData[index].enabled };
//     onChange(newData);
//   };

//   const handleDelete = (index: number) => {
//     const newData = data.filter((_, i) => i !== index);
//     onChange(newData);
//   };

//   const handleFocus = (index: number) => {
//     setFocusedRow(index);
//   };

//   const handleBlur = () => {
//     setFocusedRow(null);
//   };

//   // Always show data rows + one empty row for adding
//   const displayRows = [...data, { key: '', value: '', enabled: true }];

//   return (
//     <div className="key-value-editor">
//       <table className="w-full border-collapse">
//         <thead>
//           <tr className="border-b border-gray-200 dark:border-gray-700">
//             {allowDisable && (
//               <th className="w-10 px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">                
//               </th>
//             )}
//             <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
//               Key
//             </th>
//             <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
//               Value
//             </th>
//             <th className="w-10 px-2 py-2">
              
//             </th>
//           </tr>
//         </thead>
//         <tbody>
//           {displayRows.map((row, index) => {
//             const isEmptyRow = index === data.length;
//             const isActive = isEmptyRow && focusedRow === index;
//             const isDisabled = !row.enabled && !isEmptyRow;
            
//             // Use stable keys - for data rows use index, for empty row use special key
//             const rowKey = isEmptyRow ? 'empty-add-row' : `data-row-${index}`;
            
//             return (
//               <tr
//                 key={rowKey}
//                 className={`border-b border-gray-100 dark:border-gray-800 transition-all ${
//                   isDisabled ? 'opacity-50' : ''
//                 } ${
//                   isEmptyRow && !isActive ? 'opacity-40 hover:opacity-60' : ''
//                 }`}
//               >
//                 {allowDisable && (
//                   <td className="px-2 py-1">
//                     {!isEmptyRow && (
//                       <Checkbox.Root
//                         checked={row.enabled}
//                         onCheckedChange={() => handleToggle(index)}
//                         className="flex h-4 w-4 items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
//                       >
//                         <Checkbox.Indicator>
//                           <svg
//                             width="12"
//                             height="12"
//                             viewBox="0 0 12 12"
//                             fill="none"
//                             xmlns="http://www.w3.org/2000/svg"
//                           >
//                             <path
//                               d="M10 3L4.5 8.5L2 6"
//                               stroke="white"
//                               strokeWidth="2"
//                               strokeLinecap="round"
//                               strokeLinejoin="round"
//                             />
//                           </svg>
//                         </Checkbox.Indicator>
//                       </Checkbox.Root>
//                     )}
//                   </td>
//                 )}
//                 <td className="px-2 py-1">
//                   <input
//                     type="text"
//                     ref={(el) => setInputRef(index, 'key', el)}
//                     value={row.key}
//                     onChange={(e) => handleChange(index, 'key', e.target.value)}
//                     onFocus={() => handleFocus(index)}
//                     onBlur={handleBlur}
//                     placeholder={isEmptyRow ? placeholder.key : ''}
//                     disabled={isDisabled}
//                     list={getKeySuggestions ? `key-suggestions-${index}` : undefined}
//                     className={`w-full px-2 py-1 text-sm text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
//                       isEmptyRow ? 'italic' : ''
//                     }`}
//                   />
//                   {getKeySuggestions && (
//                     <datalist id={`key-suggestions-${index}`}>
//                       {getKeySuggestions().map((suggestion, i) => (
//                         <option key={i} value={suggestion} />
//                       ))}
//                     </datalist>
//                   )}
//                 </td>
//                 <td className="px-2 py-1">
//                   <input
//                     type="text"
//                     ref={(el) => setInputRef(index, 'value', el)}
//                     value={row.value}
//                     onChange={(e) => handleChange(index, 'value', e.target.value)}
//                     onFocus={() => handleFocus(index)}
//                     onBlur={handleBlur}
//                     placeholder={isEmptyRow ? placeholder.value : ''}
//                     disabled={isDisabled}
//                     list={getValueSuggestions && row.key ? `value-suggestions-${index}` : undefined}
//                     className={`w-full px-2 py-1 text-sm text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
//                       isEmptyRow ? 'italic' : ''
//                     }`}
//                   />
//                   {getValueSuggestions && row.key && (
//                     <datalist id={`value-suggestions-${index}`}>
//                       {getValueSuggestions(row.key).map((suggestion, i) => (
//                         <option key={i} value={suggestion} />
//                       ))}
//                     </datalist>
//                   )}
//                 </td>
//                 <td className="px-2 py-1 text-center">
//                   {!isEmptyRow && (
//                     <button
//                       onClick={() => handleDelete(index)}
//                       className="p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
//                       title="Delete"
//                     >
//                       <TrashIcon className="h-4 w-4" />
//                     </button>
//                   )}
//                 </td>
//               </tr>
//             );
//           })}
//         </tbody>
//       </table>
//     </div>
//   );
// }
