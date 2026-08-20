/******************************************************************************
** Copyright : Ikerlan
** $Author: iarmendariz $
** $RCSfile: Typedefs.h,v $
** $Name:  $      Definition of global new types
** $Log: Typedefs.h,v $
** Revision 1.7  2015/12/01 10:36:43  iarmendariz
** mejora gestion liberaciA3n memoria usada del heap.
**
** Revision 1.6  2015/12/01 10:31:12  iarmendariz
** ajustes necesarios para compilar en linux yocto
**
** Revision 1.5  2015/10/06 13:29:39  iarmendariz
** CorrecciA3n de fuga de memoria y adaptaciA3n para linux.
**
** Revision 1.4  2013/05/06 21:12:43  iarmendariz
** Cambios introducidos para que funciones en LINUX. (faltarA?a adaptar linea serie pero TCP funciona OK).
**
** Revision 1.3  2012/12/14 08:07:29  iarmendariz
** Unificacion de puertos entre bajo nivel de driver y alto nivel.
** Porting para kinetis de freescale.
**
** Revision 1.2  2011/12/16 07:30:29  iarmendariz
** rs232.c: Correccion lectura con timeout, siempre perdia 1ms aunque tuviese el caracter esperando (1 ms entre caracteres).
** tiny_shell.c: aumento numero argumentos de 12 a 40
** win32shell.cpp: ajuste tamano buffer rs232 mediante define en la cabecera del fichero.
** sdc.c y micro_pc.c: depuracion en funciones de recepcion de caracteres (para evitar perdidas) y mejora gestion del buffer del driver.
**
** Revision 1.1  2011/06/17 16:48:19  iarmendariz
** Cambios para que el driver sea mas portable. Compila OK en windows pero esta incompleto aun.
** Movido el de renesas y no se ha compilado aun.
**
** Revision 1.1  2011/03/14 10:44:46  iarmendariz
** Anadidos ficheros generales.
**
** Revision 1.5  2005/12/02 07:18:52  jamenabar
** Resuelve bug 323.
**
** Revision 1.4  2005/02/21 13:21:15  jamenabar
** Eliminado el tipo status_t. Ahora cada driver generara su drvname_status_t.
** Cambio del tipos bool_t, de unsigned int a unsigned char.
**
** Revision 1.3  2005/02/11 08:28:29  jamenabar
** Anadido el nuevo tipo 'char_t'.
**
** Revision 1.2  2005/02/02 11:27:01  jamenabar
** Reestructuracion de directorios de la TCU.
**
** Revision 1.1  2005/01/14 07:02:05  jamenabar
** Initial revision
**
**
******************************************************************************/
#ifndef TYPEDEFS_H
#define TYPEDEFS_H

#if !defined(LINUX)
	/******************************************************************************
	** Defines
	*/

	/******************************************************************************
	** Globals
	*/

	/******************************************************************************
	** Prototypes
	*/

	/******************************************************************************
	** New Types Definitions
	*/


	#ifndef VOID_T_DEFINED
		#define VOID_T_DEFINED
		typedef void                void_t;
	#endif // VOID_T_DEFINED

	#ifdef MCS51
		#ifndef BOOL_T_DEFINED
			#define BOOL_T_DEFINED
			typedef bit             bool_t;
		#endif // BOOL_T_DEFINED
	#else
		#ifndef BOOL_T_DEFINED
			#define BOOL_T_DEFINED
			typedef unsigned char    bool_t;
		#endif // BOOL_T_DEFINED
	#endif

	#ifndef CHAR_T_DEFINED
		#define CHAR_T_DEFINED
		typedef char                char_t;
	#endif // CHAR_T_DEFINED

	#ifndef UINT8_T_DEFINED
		#define UINT8_T_DEFINED
		typedef unsigned char       uint8_t;
	#endif // UINT8_T_DEFINED

	#ifndef UINT16_T_DEFINED
		#define UINT16_T_DEFINED
		typedef unsigned short      uint16_t;
	#endif // UINT16_T_DEFINED

	#ifndef UINT32_T_DEFINED
		#define UINT32_T_DEFINED
		#if defined(LINUX)
			typedef unsigned long       uint32_t;
		#else
			typedef unsigned int       uint32_t;
		#endif
	#endif // UINT32_T_DEFINED

	#ifndef UINT64_T_DEFINED
		#define UINT64_T_DEFINED
		#if defined(LINUX)
			typedef unsigned long long      uint64_t;
		#else
			typedef unsigned long long     uint64_t;
		#endif
	#endif // UINT64_T_DEFINED

	#ifndef INT8_T_DEFINED
		#define INT8_T_DEFINED
		typedef signed char         int8_t;
	#endif // INT8_T_DEFINED

	#ifndef INT16_T_DEFINED
		#define INT16_T_DEFINED
		typedef signed short        int16_t;
	#endif // INT16_T_DEFINED

	#ifndef INT32_T_DEFINED
		#define INT32_T_DEFINED
		#if defined(LINUX)
			typedef signed long int32_t;
		#else
			typedef int         int32_t;
		#endif
	#endif // INT32_T_DEFINED

	#ifndef BITSET8_T_DEFINED
		#define BITSET8_T_DEFINED
		typedef unsigned char       bitset8_t;
	#endif // BITSET8_T_DEFINED

	#ifndef BITSET16_T_DEFINED
		#define BITSET16_T_DEFINED
		typedef unsigned short      bitset16_t;
	#endif // BITSET16_T_DEFINED

	#ifndef BITSET32_T_DEFINED
		#define BITSET32_T_DEFINED
		typedef unsigned long       bitset32_t;
	#endif // BITSET32_T_DEFINED

	#ifndef FLOAT_T_DEFINED
		#define FLOAT_T_DEFINED
		typedef float               float_t;
	#endif // FLOAT_T_DEFINED

	#ifndef DOUBLE_T_DEFINED
		#define DOUBLE_T_DEFINED
		typedef long double         double_t;
	#endif // DOUBLE_T_DEFINED


	#ifndef SEM_T_DEFINED
		#define SEM_T_DEFINED
		typedef void *         sem_t;
	#endif // DOUBLE_T_DEFINED

#endif//LINUX
#endif  // TYPEDEFS_H

/*
** End of $RCSfile: Typedefs.h,v $
******************************************************************************/
