// import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// // Mock faker first - fix the structure to match how faker is used
// vi.mock('@faker-js/faker', () => {
//   // Create date mock inside the factory function to avoid hoisting issues
//   const mockToISOString = vi.fn().mockReturnValue('2023-01-01T00:00:00.000Z');
//   const mockDate = { toISOString: mockToISOString };
  
//   return {
//     faker: {
//       datatype: {
//         uuid: vi.fn().mockReturnValue('mock-uuid'),
//         number: vi.fn().mockReturnValue(42),
//         boolean: vi.fn().mockReturnValue(true)
//       },
//       date: {
//         past: vi.fn().mockReturnValue(mockDate),
//         recent: vi.fn().mockReturnValue(mockDate)
//       },
//       lorem: {
//         word: vi.fn().mockReturnValue('mock-word')
//       },
//       commerce: {
//         productName: vi.fn().mockReturnValue('Mock Product'),
//         productDescription: vi.fn().mockReturnValue('Mock Description')
//       },
//       internet: {
//         email: vi.fn().mockReturnValue('mock@example.com'),
//         url: vi.fn().mockReturnValue('http://mock.com')
//       },
//       helpers: {
//         arrayElement: vi.fn().mockImplementation(arr => arr[0])
//       }
//     }
//   };
// });

// // Then mock fs
// vi.mock('fs', () => ({
//   default: {
//     readdirSync: vi.fn(),
//     writeFileSync: vi.fn(),
//   },
//   readdirSync: vi.fn(),
//   writeFileSync: vi.fn(),
// }));

// // Other mocks
// vi.mock('@apidevtools/swagger-parser');

// // Actual imports
// import { faker } from '@faker-js/faker';
// import * as fs from 'fs';
// import path from 'path';
// import SwaggerParser from '@apidevtools/swagger-parser';
// import { OpenAPIV3 } from 'openapi-types';
// import { MockGenerator } from '../src/mock.js';

// // Create a test-specific class to expose private methods
// class TestMockGenerator extends MockGenerator {
//   constructor(specDir: string, outDir: string) {
//     super(specDir, outDir);
//   }
  
//   // Expose private methods for testing
//   public generateMockValue(schema: OpenAPIV3.SchemaObject): any {
//     switch (schema.type) {
//       case 'string':
//         if (schema.format === 'date-time') {
//           return faker.date.recent().toISOString();
//         } else if (schema.format === 'email') {
//           return faker.internet.email();
//         } else if (schema.format === 'uri') {
//           return faker.internet.url();
//         } else if (schema.enum) {
//           return faker.helpers.arrayElement(schema.enum);
//         }
//         return faker.lorem.word();

//       case 'number':
//       case 'integer':
//         return faker.datatype.number({ min: schema.minimum || 0, max: schema.maximum || 1000 });

//       case 'boolean':
//         return faker.datatype.boolean();

//       case 'array':
//         if (schema.items) {
//           const length = faker.datatype.number({ min: 1, max: 5 });
//           return Array.from({ length }, () => 
//             this.generateMockValue(schema.items as OpenAPIV3.SchemaObject)
//           );
//         }
//         return [];

//       case 'object':
//         if (schema.properties) {
//           const result: Record<string, any> = {};
          
//           for (const [prop, propSchema] of Object.entries(schema.properties)) {
//             result[prop] = this.generateMockValue(propSchema as OpenAPIV3.SchemaObject);
//           }

//           // Ensure ID exists
//           if (!result.id) {
//             result.id = faker.datatype.uuid();
//           }

//           return result;
//         }
//         return {};

//       default:
//         return null;
//     }
//   }
// }

// describe('MockGenerator', () => {
//   const mockSpecDir = '/mock/specs';
//   const mockOutDir = '/mock/out';
//   let mockGenerator: TestMockGenerator;  // Changed to TestMockGenerator
  
//   // Mock API specification
//   const mockApiSpec = {
//     paths: {
//       '/users': {
//         get: {
//           operationId: 'getUsers',
//           responses: {
//             '200': {
//               description: 'Success'
//             }
//           }
//         },
//         post: {
//           operationId: 'createUser',
//           requestBody: {
//             content: {
//               'application/json': {
//                 schema: {
//                   type: 'object',
//                   properties: {
//                     id: {
//                       type: 'string',
//                       format: 'uuid'
//                     },
//                     email: {
//                       type: 'string',
//                       format: 'email'
//                     },
//                     name: {
//                       type: 'string'
//                     },
//                     isActive: {
//                       type: 'boolean'
//                     },
//                     age: {
//                       type: 'integer',
//                       minimum: 18,
//                       maximum: 100
//                     }
//                   }
//                 }
//               }
//             }
//           },
//           responses: {
//             '201': {
//               description: 'Created'
//             }
//           }
//         }
//       },
//       '/products': {
//         get: {
//           operationId: 'getProducts'
//         }
//       }
//     }
//   } as unknown as OpenAPIV3.Document;

//   beforeEach(() => {
//     vi.clearAllMocks();
//     (fs.readdirSync as any).mockReturnValue(['api.yaml']);
//     (fs.writeFileSync as any).mockImplementation(() => undefined);
    
//     // Mock SwaggerParser
//     (SwaggerParser.parse as any).mockResolvedValue(mockApiSpec);
    
//     // Create mockGenerator instance using the test class
//     mockGenerator = new TestMockGenerator(mockSpecDir, mockOutDir);
//   });

//   afterEach(() => {
//     vi.restoreAllMocks();
//   });

//   describe('generate', () => {
//     it('should generate mock data for each spec', async () => {
//       await mockGenerator.generate();
      
//       expect(fs.readdirSync).toHaveBeenCalledWith(mockSpecDir);
//       expect(SwaggerParser.parse).toHaveBeenCalledWith(path.join(mockSpecDir, 'api.yaml'));
      
//       // Check if mock data file is written
//       expect(fs.writeFileSync).toHaveBeenCalledWith(
//         path.join(mockOutDir, 'db.json'),
//         expect.any(String)
//       );
      
//       // Verify the written content is parseable JSON with expected structure
//       const writtenContent = (fs.writeFileSync as any).mock.calls[0][1];
//       const parsedContent = JSON.parse(writtenContent);
      
//       expect(parsedContent).toHaveProperty('api');
//       expect(parsedContent.api).toHaveProperty('users');
//       expect(parsedContent.api).toHaveProperty('products');
//       expect(parsedContent.api.users).toBeInstanceOf(Array);
//       expect(parsedContent.api.products).toBeInstanceOf(Array);
//     });
//   });


// }); 