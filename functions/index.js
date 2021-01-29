const functions = require('firebase-functions')
const admin = require('firebase-admin')

admin.initializeApp(functions.config().firebase)

const algoliasearch = require('algoliasearch')
const client = algoliasearch('YN419Q56L7', 'edf8f9a3011445793f03c30eb44f69ad')

//Crear el registro del usuario en Algolia
exports.newAlgolia = functions.firestore.document('users/{uid}').onCreate((snap, context) => {
	const doc = snap.data()

		admin.firestore().collection('users')
		 							.doc(doc.uid)
		 							.get()
		 							.then(service => {
						                let data = {
						                	objectID: doc.uid,
						                	active: doc.active,
										 	name: doc.name,
										 	telephone: doc.telephone,
										 	uid: doc.uid,
										 	type: doc.role,
										 	_geoloc: {
										 		lat: service.data()._geoloc.lat,
										 		lng: service.data()._geoloc.lng,
										 	}
										}

										const index = client.initIndex('users')

										index.saveObject(data)

										return null
						            }).catch(error => {
						            	console.log('Error al subir algolia: ', error)
						            	throw error
				
					            	});
	return null
})

//Eliminar el registro del usuario en Algolia
exports.deleteAlgolia = functions.firestore.document('users/{uid}').onDelete((snap, context) => {
	const doc = snap.data()

	const index = client.initIndex('users')

	index.deleteObject(doc.uid).then(() => {
		console.log('Objeto eliminado de algolia');
		return null
	}).catch(error => {
		console.log(error);
		throw error
	});

	return null
})

//Editar el registro del usuario en algolia
exports.editAlgolia = functions.firestore.document('users/{uid}').onUpdate((change, context) => {
	const uid = context.params.uid

		admin.firestore().collection('users')
		 							.doc(uid)
		 							.get()
		 							.then(async service => {

										const index = client.initIndex('users')

										index.partialUpdateObject({
										  	name: service.data().name,
										  	active: service.data().active,
										  	type: service.data().role,
										  	telephone: service.data().telephone,
										  	_geoloc: {
										 		lat: service.data()._geoloc.lat,
										 		lng: service.data()._geoloc.lng,
										 	},
										  	objectID: uid,
										})

										return null
						            }).catch(error => {
						            	console.log('Error al editar algolia: ', error)
						            	throw error
						            });

	return null
})

//Enviar las notificaciones a los usuarios
exports.newNotification = functions.firestore.document('notifications/{token}').onCreate((snap, context) => {
	const doc = snap.data()

	let tokenFCM = context.params.token
	let message = {
		notification: {
			title: `${doc.title}`,
			body: `${doc.content}`,
		},
	}

	admin.messaging().sendToDevice(tokenFCM, message)
		.then((response) => {
			console.log('Mensaje enviado: ', response)
			return null
		})
		.catch((error) => {
			console.log('Mensaje no enviado: ', error)
			throw error
		})


 	admin.firestore().collection('notifications')
	 							.doc(tokenFCM)
	 							.delete()
 	
 	return Promise.resolve(0)

})

//Contar la cantidad de ordenes
exports.ordersCount = functions.firestore.document('orders/{orderId}').onWrite((change, context) => {
    const ordersRef = admin.firestore().collection('orders')
    const counter = admin.firestore().collection('orders').doc('counter')
    
    return admin.firestore().runTransaction(transaction => {
      	return transaction.get(ordersRef).then(ordersQuery => {
        	const ordersCount = (ordersQuery.size - 1);

			return transaction.update(counter, {
				ordersCount: ordersCount
			});
      	});
    });
})

//Contar la cantidad de cancelaciones de un usuario
exports.cancellationsCount = functions.firestore.document('information_user/{informationUserId}/orders/{orderId}').onWrite((change, context) => {
    const cancellationRef = admin.firestore().collection('information_user').doc(context.params.informationUserId);
    const ordersRef = cancellationRef.collection('orders');
    
    return admin.firestore().runTransaction(transaction => {
		return transaction.get(ordersRef).then(ordersQuery => {
			const ordersCount = ordersQuery.size;

			return transaction.update(cancellationRef, {
				cancellationsCount: ordersCount
			});
		});
    });
});

//Contar la cantidad de entregas de un usuario
exports.deliveredCount = functions.firestore.document('information_user/{informationUserId}/delivered/{orderId}').onWrite((change, context) => {
    const deliveredRef = admin.firestore().collection('information_user').doc(context.params.informationUserId);
    const ordersRef = deliveredRef.collection('delivered');
    
    return admin.firestore().runTransaction(transaction => {
		return transaction.get(ordersRef).then(ordersQuery => {
			const deliveredCount = ordersQuery.size;

			return transaction.update(deliveredRef, {
				deliveredCount: deliveredCount
			});
		});
    });
});

//Contar la cantidad de restaurantes
exports.restaurantsCount = functions.firestore.document('restaurants/{restaurantId}').onWrite((change, context) => {
    const restaurantsRef = admin.firestore().collection('restaurants')
    const counter = admin.firestore().collection('restaurants').doc('counter')
    
    return admin.firestore().runTransaction(transaction => {
      	return transaction.get(restaurantsRef).then(ordersQuery => {
        	const restaurantsCount = (ordersQuery.size - 1);

			return transaction.update(counter, {
				restaurantsCount: restaurantsCount
			});
      	});
    });
});

//Contar la cantidad de usuarios
exports.usersCount = functions.firestore.document('users/{userId}').onWrite((change, context) => {
    const usersRef = admin.firestore().collection('users')
    const counter = admin.firestore().collection('users').doc('counter')
    
    return admin.firestore().runTransaction(transaction => {
		return transaction.get(usersRef).then(ordersQuery => {
		  const usersCount = (ordersQuery.size - 1);

		  return transaction.update(counter, {
			  usersCount: usersCount
		  });
		});
  });
});

//Registrar nuevo usuario
exports.createUser = functions.firestore.document('temporary/{userId}').onCreate(async (snap, context) => {
    const userId = context.params.userId;

    const newUser = await admin.auth().createUser({
        email: snap.get('email'),
        password: snap.get('password'),
    });

	let user = snap.data()
		user.uid = newUser.uid

    // You can also store the new user in another collection with extra fields
	await admin.firestore().collection('users').doc(newUser.uid).set(user);
	
	await admin.firestore().collection('information_user').doc(newUser.uid).set({ name: user.name, cancellationsCount: 0, deliveredCount: 0 })

    // Delete the temp document
    return admin.firestore().collection('temporary').doc(userId).delete();
});

//Job para checar el plan de cada restaurante
exports.scheduledRestaurantsPlan = functions.pubsub.schedule('0 3 * * *')
	.timeZone('America/Chihuahua') // Users can choose timezone - default is America/Los_Angeles
	.onRun(async (context) => {

		let date = new Date(new Date().getFullYear(),new Date().getMonth() , new Date().getDate())

		await admin.firestore().collection('restaurants')
		 							.get()
		 							.then(restaurants => {
										restaurants.forEach(doc => {
											if (doc.data().planDeactivate.toDate() < date) {
												admin.firestore().collection('restaurants')
																		.doc(doc.id)
																		.update({ active: false, plan: null })
											}
										})


										return null
						            }).catch(error => {
						            	console.log('Error con el cron: ', error)
						            	throw error
						            });



	return null;
});

//Job para checar el plan de cada usuario
exports.scheduledUserPlan = functions.pubsub.schedule('0 3 * * *')
	.timeZone('America/Chihuahua')
	.onRun(async (context) => {

		let date = new Date(new Date().getFullYear(),new Date().getMonth() , new Date().getDate())

		await admin.firestore().collection('users')
		 							.get()
		 							.then(users => {
										users.forEach(doc => {
											if (doc.data().planDeactivate.toDate() < date) {
												admin.firestore().collection('users')
																		.doc(doc.id)
																		.update({ active: false, plan: null })
											}
										})


										return null
						            }).catch(error => {
						            	console.log('Error con el cron: ', error)
						            	throw error
						            });



	return null;
});



















