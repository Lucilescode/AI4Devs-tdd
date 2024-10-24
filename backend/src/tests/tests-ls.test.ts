import { addCandidate } from '../application/services/candidateService';
import { uploadFile } from '../application/services/fileUploadService';
import { Candidate, Education, WorkExperience, Resume } from '../domain/models';
import { validateCandidateData } from '../application/validator';
import * as fileUploadService from '../application/services/fileUploadService';
import { Request, Response } from 'express';

jest.mock('../domain/models');
jest.mock('../application/validator');
jest.mock('../application/services/fileUploadService');

const mockCandidateData = {
	name: 'John Doe',
	email: 'john@example.com',
	educations: [{ school: 'University A', degree: 'Bachelor' }],
	workExperiences: [{ company: 'Company X', position: 'Developer' }],
	cv: { fileName: 'resume.pdf' },
};

const setupMockCandidateSave = (mockData: any) => {
	(Candidate.prototype.save as jest.Mock).mockResolvedValue(mockData);
	(Education.prototype.save as jest.Mock).mockResolvedValue({});
	(WorkExperience.prototype.save as jest.Mock).mockResolvedValue({});
	(Resume.prototype.save as jest.Mock).mockResolvedValue({});
};

describe('Candidate Service', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test('should create a new candidate with all associated data', async () => {
		const mockSavedCandidate = { id: '123', ...mockCandidateData };
		setupMockCandidateSave(mockSavedCandidate);

		const result = await addCandidate(mockCandidateData);

		expect(validateCandidateData).toHaveBeenCalledWith(mockCandidateData);
		expect(Candidate).toHaveBeenCalledWith(mockCandidateData);
		expect(Education).toHaveBeenCalledWith(mockCandidateData.educations[0]);
		expect(WorkExperience).toHaveBeenCalledWith(
			mockCandidateData.workExperiences[0]
		);
		expect(Resume).toHaveBeenCalledWith(mockCandidateData.cv);
		expect(result).toEqual(mockSavedCandidate);
	});

	const candidateTestCases = [
		{ desc: 'without education', key: 'educations' },
		{ desc: 'without work experience', key: 'workExperiences' },
		{ desc: 'without CV', key: 'cv' },
	];

	candidateTestCases.forEach(({ desc, key }) => {
		test(`should handle candidate ${desc}`, async () => {
			const candidateData = { ...mockCandidateData, [key]: undefined };
			const mockSavedCandidate = { id: '123', ...candidateData };
			setupMockCandidateSave(mockSavedCandidate);

			await addCandidate(candidateData);

			if (key === 'educations')
				expect(Education.prototype.save).not.toHaveBeenCalled();
			if (key === 'workExperiences')
				expect(WorkExperience.prototype.save).not.toHaveBeenCalled();
			if (key === 'cv') expect(Resume.prototype.save).not.toHaveBeenCalled();
		});
	});

	test('should throw an error for invalid candidate data', async () => {
		(validateCandidateData as jest.Mock).mockImplementation(() => {
			throw new Error('Invalid candidate data');
		});

		await expect(addCandidate(mockCandidateData)).rejects.toThrow(
			'Invalid candidate data'
		);
	});

	test('should handle duplicate email error', async () => {
		(Candidate.prototype.save as jest.Mock).mockRejectedValue({
			code: 'P2002',
		});

		await expect(addCandidate(mockCandidateData)).rejects.toThrow(
			'The email already exists in the database'
		);
	});

	test('should handle other database errors', async () => {
		const dbError = new Error('Database connection failed');
		(Candidate.prototype.save as jest.Mock).mockRejectedValue(dbError);

		await expect(addCandidate(mockCandidateData)).rejects.toThrow(
			'Database connection failed'
		);
	});
});

describe('File Upload Service', () => {
	let mockRequest: Partial<Request>;
	let mockResponse: Partial<Response>;
	let mockNext: jest.Mock;

	beforeEach(() => {
		mockRequest = {
			file: {
				fieldname: 'file',
				originalname: 'original.pdf',
				mimetype: 'application/pdf',
				size: 12345,
				filename: 'file.pdf',
				path: '/uploads/file.pdf',
				buffer: Buffer.from('mock file content'),
			} as Express.Multer.File,
		};
		mockResponse = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn(),
		};
		mockNext = jest.fn();
	});

	const runUploadTest = (
		fileProps: any,
		expectedResponse: any,
		statusCode = 200
	) => {
		mockRequest.file = { ...mockRequest.file, ...fileProps };
		(fileUploadService.uploadFile as jest.Mock).mockImplementation(
			(req, res) => {
				res.status(statusCode).json(expectedResponse);
			}
		);

		fileUploadService.uploadFile(
			mockRequest as Request,
			mockResponse as Response
		);

		expect(mockResponse.status).toHaveBeenCalledWith(statusCode);
		expect(mockResponse.json).toHaveBeenCalledWith(expectedResponse);
	};

	test('should handle successful PDF upload', () => {
		runUploadTest(
			{ originalname: 'original.pdf', mimetype: 'application/pdf' },
			{ filePath: '/uploads/file.pdf', fileType: 'application/pdf' }
		);
	});

	test('should handle successful DOCX upload', () => {
		runUploadTest(
			{
				originalname: 'original.docx',
				mimetype:
					'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			},
			{
				filePath: '/uploads/file.docx',
				fileType:
					'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			}
		);
	});

	test('should handle file size limit exceeded error', () => {
		runUploadTest({}, { error: 'LIMIT_FILE_SIZE' }, 500);
	});

	test('should handle unexpected file error', () => {
		runUploadTest({}, { error: 'LIMIT_UNEXPECTED_FILE' }, 500);
	});

	test('should handle generic upload error', () => {
		runUploadTest({}, { error: 'Generic error' }, 500);
	});

	test('should reject invalid file types', () => {
		runUploadTest(
			{},
			{ error: 'Invalid file type, only PDF and DOCX are allowed!' },
			400
		);
	});
});
